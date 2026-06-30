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
  modeLimit?: number;
  modeEmHeatAvailable?: number | boolean;
  fan?: number;
  fanCirculate?: number;
  fanCirculateSpeed?: number;
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

export interface AccessoryContext {
  device: DaikinDevice;
}
