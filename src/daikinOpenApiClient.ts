import { hrtime } from 'node:process';

import type { Logging } from 'homebridge';

import { EquipmentStatus, ThermostatMode } from './types.js';
import type {
  DaikinDevice,
  DaikinLocation,
  DaikinPlatformConfig,
  DaikinThermostatData,
  DaikinThermostatUpdate,
} from './types.js';

interface DaikinTokenResponse {
  accessToken: string;
  accessTokenExpiresIn: number;
}

type DataChanged = () => void;

const DAIKIN_ONE_BASE_URI = 'https://integrator-api.daikinskyport.com';
const TOKEN_URL = `${DAIKIN_ONE_BASE_URI}/v1/token`;
const DEVICES_URL = `${DAIKIN_ONE_BASE_URI}/v1/devices`;
const WRITE_DELAY_MS = 15_000;
const DEFAULT_REQUEST_TIMEOUT_SECONDS = 20;

export class DaikinOpenApiClient {
  private token?: DaikinTokenResponse;
  private tokenExpiresAtMs = 0;
  private devices = new Map<string, DaikinDevice>();
  private listeners = new Map<string, Set<DataChanged>>();
  private refreshTimer?: NodeJS.Timeout;
  private initialized = false;
  private readonly pollIntervalMs: number;
  private readonly requestTimeoutMs: number;
  private noPollBeforeMs = 0;

  public constructor(
    private readonly config: DaikinPlatformConfig,
    private readonly log: Logging,
  ) {
    this.pollIntervalMs = Math.max(180, config.pollIntervalSeconds) * 1000;
    this.requestTimeoutMs = Math.max(1, config.requestTimeoutSeconds || DEFAULT_REQUEST_TIMEOUT_SECONDS) * 1000;
  }

  public isInitialized(): boolean {
    return this.initialized;
  }

  public getDeviceList(): DaikinDevice[] {
    return [...this.devices.values()];
  }

  public getDevice(deviceId: string): DaikinDevice | undefined {
    return this.devices.get(deviceId);
  }

  public addListener(deviceId: string, listener: DataChanged): void {
    let deviceListeners = this.listeners.get(deviceId);
    if (!deviceListeners) {
      deviceListeners = new Set();
      this.listeners.set(deviceId, deviceListeners);
    }
    deviceListeners.add(listener);

    if (this.devices.get(deviceId)?.data) {
      listener();
    }
  }

  public async initialize(): Promise<void> {
    await this.authenticate();
    await this.discoverDevices();
    await this.refreshAllDevices();
    this.initialized = this.devices.size > 0;
    this.scheduleRefresh(this.pollIntervalMs);
  }

  public requestRefreshNow(): void {
    const delayMs = Math.max(0, this.noPollBeforeMs - this.monotonicMs());
    this.scheduleRefresh(delayMs);
  }

  public getCurrentStatus(deviceId: string): number {
    return this.devices.get(deviceId)?.data?.equipmentStatus ?? EquipmentStatus.IDLE;
  }

  public getMode(deviceId: string): number {
    return this.devices.get(deviceId)?.data?.mode ?? ThermostatMode.OFF;
  }

  public getCurrentTemperature(deviceId: string): number {
    return this.devices.get(deviceId)?.data?.tempIndoor ?? -270;
  }

  public getTargetTemperature(deviceId: string): number {
    const data = this.devices.get(deviceId)?.data;
    if (!data) {
      return -270;
    }
    return data.mode === ThermostatMode.COOL ? data.coolSetpoint : data.heatSetpoint;
  }

  public getHeatingThreshold(deviceId: string): number {
    return this.devices.get(deviceId)?.data?.heatSetpoint ?? -270;
  }

  public getCoolingThreshold(deviceId: string): number {
    return this.devices.get(deviceId)?.data?.coolSetpoint ?? -270;
  }

  public getSetpointMinimum(deviceId: string): number {
    return this.devices.get(deviceId)?.data?.setpointMinimum ?? 10;
  }

  public getSetpointMaximum(deviceId: string): number {
    return this.devices.get(deviceId)?.data?.setpointMaximum ?? 35;
  }

  public getSetpointDelta(deviceId: string): number {
    return this.devices.get(deviceId)?.data?.setpointDelta ?? 1.5;
  }

  public getCurrentHumidity(deviceId: string): number {
    return this.devices.get(deviceId)?.data?.humIndoor ?? 0;
  }

  public async setMode(deviceId: string, mode: number): Promise<boolean> {
    const data = this.devices.get(deviceId)?.data;
    if (!data) {
      this.log.error('Cannot set mode for %s because no device data is loaded.', deviceId);
      return false;
    }

    return this.putMsp(deviceId, this.withSetpointDelta(data, {
      mode: this.normalizeMode(mode),
      heatSetpoint: data.heatSetpoint,
      coolSetpoint: data.coolSetpoint,
    }));
  }

  public async setTargetTemperature(deviceId: string, temperature: number): Promise<boolean> {
    const data = this.devices.get(deviceId)?.data;
    if (!data) {
      this.log.error('Cannot set target temperature for %s because no device data is loaded.', deviceId);
      return false;
    }

    if (data.mode === ThermostatMode.OFF) {
      this.log.debug('Ignoring target temperature write while %s is off.', deviceId);
      return true;
    }

    const update =
      data.mode === ThermostatMode.COOL
        ? { mode: data.mode, heatSetpoint: data.heatSetpoint, coolSetpoint: temperature }
        : { mode: data.mode, heatSetpoint: temperature, coolSetpoint: data.coolSetpoint };

    return this.putMsp(deviceId, this.withSetpointDelta(data, update));
  }

  public async setThresholds(deviceId: string, heatSetpoint?: number, coolSetpoint?: number): Promise<boolean> {
    const data = this.devices.get(deviceId)?.data;
    if (!data) {
      this.log.error('Cannot set thresholds for %s because no device data is loaded.', deviceId);
      return false;
    }

    return this.putMsp(deviceId, this.withSetpointDelta(data, {
      mode: data.mode,
      heatSetpoint: heatSetpoint ?? data.heatSetpoint,
      coolSetpoint: coolSetpoint ?? data.coolSetpoint,
    }));
  }

  private async authenticate(): Promise<void> {
    this.debug('Authenticating with Daikin One Open API.');
    const response = await this.fetchJson<DaikinTokenResponse>(TOKEN_URL, {
      method: 'POST',
      headers: this.baseHeaders(),
      body: JSON.stringify({
        email: this.config.integratorEmail,
        integratorToken: this.config.integratorToken,
      }),
    });

    this.token = response;
    this.tokenExpiresAtMs = Date.now() + response.accessTokenExpiresIn * 1000 - 60_000;
  }

  private async discoverDevices(): Promise<void> {
    const locations = await this.authorizedGet<DaikinLocation[]>(DEVICES_URL);
    const allowedIds = new Set(this.config.deviceIds);
    const nextDevices = new Map<string, DaikinDevice>();

    for (const location of locations) {
      for (const device of location.devices ?? []) {
        if (allowedIds.size > 0 && !allowedIds.has(device.id)) {
          continue;
        }

        nextDevices.set(device.id, {
          ...this.devices.get(device.id),
          ...device,
          locationName: location.locationName,
        });
      }
    }

    this.devices = nextDevices;
    this.log.info('Discovered %d Daikin Open API device(s).', this.devices.size);
  }

  private async refreshAllDevices(): Promise<void> {
    await this.ensureToken();
    for (const device of this.devices.values()) {
      try {
        const data = await this.authorizedGet<Record<string, unknown>>(`${DEVICES_URL}/${device.id}`);
        if (this.config.logRaw) {
          this.log.info('Raw Daikin payload for %s: %s', device.id, JSON.stringify(data));
        }
        this.updateDeviceData(device.id, this.normalizeThermostatData(data));
        this.notify(device.id);
      } catch (error) {
        this.logError(`Unable to refresh ${device.name} (${device.id}).`, error);
      }
    }
  }

  private async putMsp(deviceId: string, update: DaikinThermostatUpdate): Promise<boolean> {
    if (this.config.readonly) {
      this.log.warn('Read-only mode is enabled. Skipping Daikin write for %s.', deviceId);
      return false;
    }

    try {
      await this.ensureToken();
      if (this.config.logRaw) {
        this.log.info('Daikin write payload for %s: %s', deviceId, JSON.stringify(update));
      }
      await this.fetchJson<unknown>(`${DEVICES_URL}/${deviceId}/msp`, {
        method: 'PUT',
        headers: this.authorizedHeaders(),
        body: JSON.stringify(update),
      });

      this.updateDeviceData(deviceId, update);
      this.notify(deviceId);
      this.noPollBeforeMs = this.monotonicMs() + WRITE_DELAY_MS;
      this.scheduleRefresh(WRITE_DELAY_MS);
      return true;
    } catch (error) {
      this.logError(`Unable to write Daikin device ${deviceId}.`, error);
      return false;
    }
  }

  private updateDeviceData(deviceId: string, update: DaikinThermostatUpdate | Partial<DaikinThermostatData>): void {
    const device = this.devices.get(deviceId);
    if (!device) {
      this.log.error('Received update for unknown device %s.', deviceId);
      return;
    }

    device.data = {
      ...(device.data ?? {}),
      ...update,
    } as DaikinThermostatData;
  }

  private async authorizedGet<T>(url: string): Promise<T> {
    await this.ensureToken();
    return this.fetchJson<T>(url, {
      headers: this.authorizedHeaders(),
    });
  }

  private async ensureToken(): Promise<void> {
    if (!this.token || Date.now() >= this.tokenExpiresAtMs) {
      await this.authenticate();
    }
  }

  private async fetchJson<T>(url: string, init: RequestInit): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs);

    let response: Response;
    try {
      response = await fetch(url, {
        ...init,
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Request ${url} timed out after ${this.requestTimeoutMs / 1000} seconds.`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      throw new Error(`Request ${url} failed with ${response.status} ${response.statusText}: ${await response.text()}`);
    }

    const text = await response.text();
    return (text.length > 0 ? JSON.parse(text) : undefined) as T;
  }

  private baseHeaders(): Record<string, string> {
    return {
      'x-api-key': this.config.apiKey,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };
  }

  private authorizedHeaders(): Record<string, string> {
    if (!this.token) {
      throw new Error('No Daikin Open API token is available.');
    }

    return {
      ...this.baseHeaders(),
      Authorization: `Bearer ${this.token.accessToken}`,
    };
  }

  private scheduleRefresh(delayMs: number): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }

    this.refreshTimer = setTimeout(() => {
      void this.refreshAllDevices()
        .catch(error => this.logError('Scheduled Daikin refresh failed.', error))
        .finally(() => this.scheduleRefresh(this.pollIntervalMs));
    }, delayMs);
    this.refreshTimer.unref?.();
  }

  private notify(deviceId: string): void {
    for (const listener of this.listeners.get(deviceId) ?? []) {
      listener();
    }
  }

  private monotonicMs(): number {
    return Number(hrtime.bigint() / BigInt(1_000_000));
  }

  private normalizeThermostatData(payload: Record<string, unknown>): DaikinThermostatData {
    return {
      equipmentStatus: this.numberFrom(payload.equipmentStatus, EquipmentStatus.IDLE) as EquipmentStatus,
      mode: this.normalizeMode(payload.mode),
      modeLimit: this.optionalNumber(payload.modeLimit),
      modeEmHeatAvailable: this.optionalBooleanOrNumber(payload.modeEmHeatAvailable),
      fan: this.optionalNumber(payload.fan),
      fanCirculate: this.optionalNumber(payload.fanCirculate),
      fanCirculateSpeed: this.optionalNumber(payload.fanCirculateSpeed),
      heatSetpoint: this.numberFrom(payload.heatSetpoint, 20),
      coolSetpoint: this.numberFrom(payload.coolSetpoint, 24),
      setpointDelta: this.optionalNumber(payload.setpointDelta),
      setpointMinimum: this.optionalNumber(payload.setpointMinimum),
      setpointMaximum: this.optionalNumber(payload.setpointMaximum),
      tempIndoor: this.numberFrom(payload.tempIndoor, -270),
      humIndoor: this.optionalNumber(payload.humIndoor),
      tempOutdoor: this.optionalNumber(payload.tempOutdoor),
      humOutdoor: this.optionalNumber(payload.humOutdoor),
      scheduleEnabled: this.optionalBoolean(payload.scheduleEnabled),
      geofencingEnabled: this.optionalBoolean(payload.geofencingEnabled),
    };
  }

  private withSetpointDelta(data: DaikinThermostatData, update: DaikinThermostatUpdate): DaikinThermostatUpdate {
    const minimum = data.setpointMinimum ?? 10;
    const maximum = data.setpointMaximum ?? 35;
    const delta = data.setpointDelta ?? 1.5;

    let heatSetpoint = this.clamp(update.heatSetpoint, minimum, maximum);
    let coolSetpoint = this.clamp(update.coolSetpoint, minimum, maximum);

    if (update.mode === ThermostatMode.AUTO && coolSetpoint - heatSetpoint < delta) {
      if (update.coolSetpoint !== data.coolSetpoint) {
        heatSetpoint = this.clamp(coolSetpoint - delta, minimum, maximum);
        coolSetpoint = this.clamp(Math.max(coolSetpoint, heatSetpoint + delta), minimum, maximum);
      } else {
        coolSetpoint = this.clamp(heatSetpoint + delta, minimum, maximum);
        heatSetpoint = this.clamp(Math.min(heatSetpoint, coolSetpoint - delta), minimum, maximum);
      }
    }

    return {
      mode: update.mode,
      heatSetpoint,
      coolSetpoint,
    };
  }

  private normalizeMode(value: unknown): ThermostatMode {
    const mode = this.numberFrom(value, ThermostatMode.OFF);
    switch (mode) {
      case ThermostatMode.HEAT:
      case ThermostatMode.COOL:
      case ThermostatMode.AUTO:
      case ThermostatMode.EMERGENCY_HEAT:
        return mode;
      default:
        return ThermostatMode.OFF;
    }
  }

  private optionalBoolean(value: unknown): boolean | undefined {
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'number') {
      return value !== 0;
    }
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.toLowerCase() === 'true' || value === '1';
    }
    return undefined;
  }

  private optionalBooleanOrNumber(value: unknown): number | boolean | undefined {
    if (typeof value === 'boolean') {
      return value;
    }
    return this.optionalNumber(value);
  }

  private optionalNumber(value: unknown): number | undefined {
    const numberValue = this.numberFrom(value, Number.NaN);
    return Number.isFinite(numberValue) ? numberValue : undefined;
  }

  private numberFrom(value: unknown, fallback: number): number {
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : fallback;
    }
    if (typeof value === 'string') {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : fallback;
    }
    return fallback;
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }

  private debug(message: string, ...parameters: unknown[]): void {
    if (this.config.debug) {
      this.log.info(message, ...parameters);
    }
  }

  private logError(message: string, error: unknown): void {
    this.log.error(message);
    this.log.error(error instanceof Error ? error.message : String(error));
  }
}
