import type {
  API,
  Characteristic,
  DynamicPlatformPlugin,
  Logging,
  PlatformAccessory,
  PlatformConfig,
  Service,
} from 'homebridge';

import { DaikinOpenApiClient } from './daikinOpenApiClient.js';
import { DaikinThermostatAccessory } from './thermostatAccessory.js';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings.js';
import type { AccessoryContext, DaikinDevice, DaikinPlatformConfig } from './types.js';

export class DaikinOpenApiPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service;
  public readonly Characteristic: typeof Characteristic;
  public readonly config: DaikinPlatformConfig;
  public readonly client: DaikinOpenApiClient;
  private readonly accessories: PlatformAccessory<AccessoryContext>[] = [];

  public constructor(
    public readonly log: Logging,
    rawConfig: PlatformConfig,
    public readonly api: API,
  ) {
    this.Service = api.hap.Service;
    this.Characteristic = api.hap.Characteristic;
    this.config = this.parseConfig(rawConfig);
    this.client = new DaikinOpenApiClient(this.config, log);

    api.on('didFinishLaunching', () => {
      void this.discover();
    });
  }

  public configureAccessory(accessory: PlatformAccessory<AccessoryContext>): void {
    this.log.info('Loading accessory from cache: %s', accessory.displayName);
    this.accessories.push(accessory);
  }

  public accessoryName(device: DaikinDevice, suffix: string): string {
    if (this.config.includeDeviceName) {
      return suffix ? `${device.name} ${suffix}` : device.name;
    }
    return suffix || this.config.name;
  }

  private async discover(): Promise<void> {
    try {
      await this.client.initialize();
    } catch (error) {
      this.log.error('Daikin Open API discovery failed.');
      this.log.error(error instanceof Error ? error.message : String(error));
      return;
    }

    const activeAccessoryIds = new Set<string>();
    for (const device of this.client.getDeviceList()) {
      activeAccessoryIds.add(this.registerThermostat(device).UUID);
    }

    const staleAccessories = this.accessories.filter(accessory => !activeAccessoryIds.has(accessory.UUID));
    if (staleAccessories.length > 0) {
      this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, staleAccessories);
    }
  }

  private registerThermostat(device: DaikinDevice): PlatformAccessory<AccessoryContext> {
    const uuid = this.api.hap.uuid.generate(`${device.id}:thermostat`);
    const displayName = this.accessoryName(device, 'Thermostat');
    let accessory = this.accessories.find(existing => existing.UUID === uuid);

    if (accessory) {
      accessory.displayName = displayName;
      accessory.context.device = device;
      this.log.info('Restoring thermostat from cache: %s', displayName);
    } else {
      accessory = new this.api.platformAccessory<AccessoryContext>(displayName, uuid);
      accessory.context.device = device;
      this.accessories.push(accessory);
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      this.log.info('Added thermostat: %s', displayName);
    }

    new DaikinThermostatAccessory(this, accessory, device.id);
    return accessory;
  }

  private parseConfig(config: PlatformConfig): DaikinPlatformConfig {
    const requiredStrings = ['apiKey', 'integratorEmail', 'integratorToken'] as const;
    for (const key of requiredStrings) {
      if (typeof config[key] !== 'string' || config[key].trim().length === 0) {
        throw new Error(`Missing required Daikin Open API config value: ${key}`);
      }
    }

    return {
      name: typeof config.name === 'string' && config.name.length > 0 ? config.name : 'Daikin One',
      apiKey: String(config.apiKey),
      integratorEmail: String(config.integratorEmail),
      integratorToken: String(config.integratorToken),
      pollIntervalSeconds: typeof config.pollIntervalSeconds === 'number' ? Math.max(180, config.pollIntervalSeconds) : 180,
      requestTimeoutSeconds: typeof config.requestTimeoutSeconds === 'number' ? Math.max(1, config.requestTimeoutSeconds) : 20,
      includeDeviceName: config.includeDeviceName !== false,
      deviceIds: Array.isArray(config.deviceIds) ? config.deviceIds.filter((id): id is string => typeof id === 'string') : [],
      readonly: Boolean(config.readonly),
      debug: Boolean(config.debug),
      logRaw: Boolean(config.logRaw),
    };
  }
}
