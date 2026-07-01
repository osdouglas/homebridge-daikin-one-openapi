export const enum ThermostatMode {
  OFF = 0,
  HEAT = 1,
  COOL = 2,
  AUTO = 3,
  EMERGENCY_HEAT = 4,
}

export const enum EquipmentStatus {
  COOLING = 1,
  OVERCOOL_DEHUMIDIFYING = 2,
  HEATING = 3,
  FAN = 4,
  IDLE = 5,
}

export const enum ModeLimit {
  NONE = 0,
  ALL = 1,
  HEAT_ONLY = 2,
  COOL_ONLY = 3,
}

export const enum FanCirculateMode {
  OFF = 0,
  ON = 1,
  SCHEDULE = 2,
}

export const enum FanCirculateSpeed {
  LOW = 0,
  MEDIUM = 1,
  HIGH = 2,
}

export interface DaikinPlatformConfig {
  name: string;
  apiKey: string;
  integratorEmail: string;
  integratorToken: string;
  pollIntervalSeconds: number;
  requestTimeoutSeconds: number;
  includeDeviceName: boolean;
  deviceIds: string[];
  readonly: boolean;
  debug: boolean;
  logRaw: boolean;
}

export interface DaikinLocation {
  locationName: string;
  devices: DaikinDevice[];
}

export interface DaikinDevice {
  id: string;
  name: string;
  model?: string;
  firmwareVersion?: string;
  locationName?: string;
  data?: DaikinThermostatData;
}

export interface DaikinThermostatData {
  equipmentStatus: EquipmentStatus;
  mode: ThermostatMode;
  modeLimit?: ModeLimit;
  modeEmHeatAvailable?: number | boolean;
  fan?: number;
  fanCirculate?: FanCirculateMode;
  fanCirculateSpeed?: FanCirculateSpeed;
  heatSetpoint: number;
  coolSetpoint: number;
  setpointDelta?: number;
  setpointMinimum?: number;
  setpointMaximum?: number;
  tempIndoor: number;
  humIndoor?: number;
  tempOutdoor?: number;
  humOutdoor?: number;
  scheduleEnabled?: boolean;
  geofencingEnabled?: boolean;
}

export type DaikinThermostatUpdate = Pick<DaikinThermostatData, 'mode' | 'heatSetpoint' | 'coolSetpoint'>;

export interface DaikinFanUpdate {
  fanCirculate: FanCirculateMode;
  fanCirculateSpeed?: FanCirculateSpeed;
}

export interface DaikinScheduleUpdate {
  scheduleEnabled: boolean;
}

export interface AccessoryContext {
  device: DaikinDevice;
}
