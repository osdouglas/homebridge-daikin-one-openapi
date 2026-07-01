import {
  EquipmentStatus,
  FanCirculateMode,
  FanCirculateSpeed,
  ModeLimit,
  ThermostatMode,
  type DaikinThermostatData,
} from './types.js';

const KNOWN_THERMOSTAT_FIELDS = new Set([
  'equipmentStatus',
  'mode',
  'modeLimit',
  'modeEmHeatAvailable',
  'fan',
  'fanCirculate',
  'fanCirculateSpeed',
  'heatSetpoint',
  'coolSetpoint',
  'setpointDelta',
  'setpointMinimum',
  'setpointMaximum',
  'tempIndoor',
  'humIndoor',
  'tempOutdoor',
  'humOutdoor',
  'scheduleEnabled',
  'geofencingEnabled',
]);

export function normalizeThermostatData(payload: Record<string, unknown>): DaikinThermostatData {
  return {
    equipmentStatus: numberFrom(payload.equipmentStatus, EquipmentStatus.IDLE) as EquipmentStatus,
    mode: normalizeMode(payload.mode),
    modeLimit: normalizeModeLimit(payload.modeLimit),
    modeEmHeatAvailable: optionalBooleanOrNumber(payload.modeEmHeatAvailable),
    fan: optionalNumber(payload.fan),
    fanCirculate: normalizeFanCirculateMode(payload.fanCirculate),
    fanCirculateSpeed: normalizeFanCirculateSpeed(payload.fanCirculateSpeed),
    heatSetpoint: numberFrom(payload.heatSetpoint, 20),
    coolSetpoint: numberFrom(payload.coolSetpoint, 24),
    setpointDelta: optionalNumber(payload.setpointDelta),
    setpointMinimum: optionalNumber(payload.setpointMinimum),
    setpointMaximum: optionalNumber(payload.setpointMaximum),
    tempIndoor: numberFrom(payload.tempIndoor, -270),
    humIndoor: optionalNumber(payload.humIndoor),
    tempOutdoor: optionalNumber(payload.tempOutdoor),
    humOutdoor: optionalNumber(payload.humOutdoor),
    scheduleEnabled: optionalBoolean(payload.scheduleEnabled),
    geofencingEnabled: optionalBoolean(payload.geofencingEnabled),
  };
}

export interface ThermostatPayloadValidation {
  warnings: string[];
  developerNotes: string[];
}

export function validateThermostatPayload(payload: Record<string, unknown>): ThermostatPayloadValidation {
  return {
    warnings: [
      ...missingRequiredFieldIssues(payload),
      ...invalidRequiredNumberIssues(payload),
      ...invalidEnumIssues(payload),
    ],
    developerNotes: unknownFieldIssues(payload),
  };
}

function missingRequiredFieldIssues(payload: Record<string, unknown>): string[] {
  return ['equipmentStatus', 'mode', 'heatSetpoint', 'coolSetpoint', 'tempIndoor']
    .filter(field => payload[field] === undefined || payload[field] === null || isBlankString(payload[field]))
    .map(field => `missing required field ${field}`);
}

function invalidRequiredNumberIssues(payload: Record<string, unknown>): string[] {
  return ['equipmentStatus', 'mode', 'heatSetpoint', 'coolSetpoint', 'tempIndoor']
    .filter(field =>
      payload[field] !== undefined &&
      payload[field] !== null &&
      !isBlankString(payload[field]) &&
      !Number.isFinite(numberFrom(payload[field], Number.NaN)),
    )
    .map(field => `invalid numeric field ${field}`);
}

function invalidEnumIssues(payload: Record<string, unknown>): string[] {
  const issues: string[] = [];
  const equipmentStatus = optionalNumber(payload.equipmentStatus);
  const mode = optionalNumber(payload.mode);
  const modeLimit = optionalNumber(payload.modeLimit);
  const fanCirculate = optionalNumber(payload.fanCirculate);
  const fanCirculateSpeed = optionalNumber(payload.fanCirculateSpeed);

  if (equipmentStatus !== undefined && !isKnownEquipmentStatus(equipmentStatus)) {
    issues.push(`unsupported equipmentStatus ${String(payload.equipmentStatus)}`);
  }
  if (mode !== undefined && !isKnownMode(mode)) {
    issues.push(`unsupported mode ${String(payload.mode)}`);
  }
  if (modeLimit !== undefined && !isKnownModeLimit(modeLimit)) {
    issues.push(`unsupported modeLimit ${String(payload.modeLimit)}`);
  }
  if (fanCirculate !== undefined && !isKnownFanCirculateMode(fanCirculate)) {
    issues.push(`unsupported fanCirculate ${String(payload.fanCirculate)}`);
  }
  if (fanCirculateSpeed !== undefined && !isKnownFanCirculateSpeed(fanCirculateSpeed)) {
    issues.push(`unsupported fanCirculateSpeed ${String(payload.fanCirculateSpeed)}`);
  }
  return issues;
}

function isKnownEquipmentStatus(value: number): boolean {
  return [
    EquipmentStatus.COOLING,
    EquipmentStatus.OVERCOOL_DEHUMIDIFYING,
    EquipmentStatus.HEATING,
    EquipmentStatus.FAN,
    EquipmentStatus.IDLE,
  ].includes(value as EquipmentStatus);
}

function isKnownMode(value: number): boolean {
  return [
    ThermostatMode.OFF,
    ThermostatMode.HEAT,
    ThermostatMode.COOL,
    ThermostatMode.AUTO,
    ThermostatMode.EMERGENCY_HEAT,
  ].includes(value as ThermostatMode);
}

function isKnownModeLimit(value: number): boolean {
  return [ModeLimit.NONE, ModeLimit.ALL, ModeLimit.HEAT_ONLY, ModeLimit.COOL_ONLY].includes(value as ModeLimit);
}

function isKnownFanCirculateMode(value: number): boolean {
  return [FanCirculateMode.OFF, FanCirculateMode.ON, FanCirculateMode.SCHEDULE].includes(value as FanCirculateMode);
}

function isKnownFanCirculateSpeed(value: number): boolean {
  return [FanCirculateSpeed.LOW, FanCirculateSpeed.MEDIUM, FanCirculateSpeed.HIGH].includes(value as FanCirculateSpeed);
}

function unknownFieldIssues(payload: Record<string, unknown>): string[] {
  return Object.keys(payload)
    .filter(field => !KNOWN_THERMOSTAT_FIELDS.has(field))
    .map(field => `unexpected field ${field}`);
}

export function normalizeModeLimit(value: unknown): ModeLimit | undefined {
  const modeLimit = optionalNumber(value);
  switch (modeLimit) {
    case ModeLimit.NONE:
    case ModeLimit.ALL:
    case ModeLimit.HEAT_ONLY:
    case ModeLimit.COOL_ONLY:
      return modeLimit;
    default:
      return modeLimit as ModeLimit | undefined;
  }
}

export function normalizeMode(value: unknown): ThermostatMode {
  const mode = numberFrom(value, ThermostatMode.OFF);
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

function normalizeFanCirculateMode(value: unknown): FanCirculateMode | undefined {
  const mode = optionalNumber(value);
  switch (mode) {
    case FanCirculateMode.OFF:
    case FanCirculateMode.ON:
    case FanCirculateMode.SCHEDULE:
      return mode;
    default:
      return undefined;
  }
}

function normalizeFanCirculateSpeed(value: unknown): FanCirculateSpeed | undefined {
  const speed = optionalNumber(value);
  switch (speed) {
    case FanCirculateSpeed.LOW:
    case FanCirculateSpeed.MEDIUM:
    case FanCirculateSpeed.HIGH:
      return speed;
    default:
      return undefined;
  }
}

function optionalBoolean(value: unknown): boolean | undefined {
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

function optionalBooleanOrNumber(value: unknown): number | boolean | undefined {
  if (typeof value === 'boolean') {
    return value;
  }
  return optionalNumber(value);
}

function optionalNumber(value: unknown): number | undefined {
  const numberValue = numberFrom(value, Number.NaN);
  return Number.isFinite(numberValue) ? numberValue : undefined;
}

function isBlankString(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length === 0;
}

function numberFrom(value: unknown, fallback: number): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : fallback;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return fallback;
    }
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}
