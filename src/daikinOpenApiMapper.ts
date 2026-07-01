import {
  EquipmentStatus,
  FanCirculateMode,
  FanCirculateSpeed,
  ModeLimit,
  ThermostatMode,
  type DaikinThermostatData,
} from './types.js';

type ThermostatField = keyof DaikinThermostatData;
type ThermostatFieldValue = DaikinThermostatData[ThermostatField];

interface ParsedThermostatField {
  value: ThermostatFieldValue;
  missingRequired?: string;
  invalidRequiredNumber?: string;
  unsupportedEnum?: string;
}

interface ThermostatFieldSpec {
  field: ThermostatField;
  parse(value: unknown): ParsedThermostatField;
}

export interface ThermostatPayloadValidation {
  warnings: string[];
  developerNotes: string[];
}

export interface ThermostatPayloadParseResult extends ThermostatPayloadValidation {
  data: DaikinThermostatData;
}

const EQUIPMENT_STATUSES = [
  EquipmentStatus.COOLING,
  EquipmentStatus.OVERCOOL_DEHUMIDIFYING,
  EquipmentStatus.HEATING,
  EquipmentStatus.FAN,
  EquipmentStatus.IDLE,
] as const;

const THERMOSTAT_MODES = [
  ThermostatMode.OFF,
  ThermostatMode.HEAT,
  ThermostatMode.COOL,
  ThermostatMode.AUTO,
  ThermostatMode.EMERGENCY_HEAT,
] as const;

const MODE_LIMITS = [ModeLimit.NONE, ModeLimit.ALL, ModeLimit.HEAT_ONLY, ModeLimit.COOL_ONLY] as const;
const FAN_CIRCULATE_MODES = [FanCirculateMode.OFF, FanCirculateMode.ON, FanCirculateMode.SCHEDULE] as const;
const FAN_CIRCULATE_SPEEDS = [FanCirculateSpeed.LOW, FanCirculateSpeed.MEDIUM, FanCirculateSpeed.HIGH] as const;

const MODE_FIELD = requiredEnumNumber('mode', ThermostatMode.OFF, THERMOSTAT_MODES);
const MODE_LIMIT_FIELD = optionalEnumNumber('modeLimit', MODE_LIMITS, { preserveUnknown: true });

const THERMOSTAT_FIELDS = [
  requiredEnumNumber('equipmentStatus', EquipmentStatus.IDLE, EQUIPMENT_STATUSES, { preserveUnknown: true }),
  MODE_FIELD,
  MODE_LIMIT_FIELD,
  optionalBooleanOrNumber('modeEmHeatAvailable'),
  optionalNumber('fan'),
  optionalEnumNumber('fanCirculate', FAN_CIRCULATE_MODES),
  optionalEnumNumber('fanCirculateSpeed', FAN_CIRCULATE_SPEEDS),
  requiredNumber('heatSetpoint', 20),
  requiredNumber('coolSetpoint', 24),
  optionalNumber('setpointDelta'),
  optionalNumber('setpointMinimum'),
  optionalNumber('setpointMaximum'),
  requiredNumber('tempIndoor', -270),
  optionalNumber('humIndoor'),
  optionalNumber('tempOutdoor'),
  optionalNumber('humOutdoor'),
  optionalBoolean('scheduleEnabled'),
  optionalBoolean('geofencingEnabled'),
] as const satisfies readonly ThermostatFieldSpec[];

const KNOWN_THERMOSTAT_FIELDS = new Set<ThermostatField>(THERMOSTAT_FIELDS.map(spec => spec.field));

export function parseThermostatPayload(payload: Record<string, unknown>): ThermostatPayloadParseResult {
  const data: Partial<Record<ThermostatField, ThermostatFieldValue>> = {};
  const missingRequired: string[] = [];
  const invalidRequiredNumbers: string[] = [];
  const unsupportedEnums: string[] = [];

  for (const spec of THERMOSTAT_FIELDS) {
    const parsed = spec.parse(payload[spec.field]);
    data[spec.field] = parsed.value;
    if (parsed.missingRequired) {
      missingRequired.push(parsed.missingRequired);
    }
    if (parsed.invalidRequiredNumber) {
      invalidRequiredNumbers.push(parsed.invalidRequiredNumber);
    }
    if (parsed.unsupportedEnum) {
      unsupportedEnums.push(parsed.unsupportedEnum);
    }
  }

  return {
    data: data as DaikinThermostatData,
    warnings: [...missingRequired, ...invalidRequiredNumbers, ...unsupportedEnums],
    developerNotes: unknownFieldIssues(payload),
  };
}

export function normalizeThermostatData(payload: Record<string, unknown>): DaikinThermostatData {
  return parseThermostatPayload(payload).data;
}

export function validateThermostatPayload(payload: Record<string, unknown>): ThermostatPayloadValidation {
  const { warnings, developerNotes } = parseThermostatPayload(payload);
  return { warnings, developerNotes };
}

export function normalizeModeLimit(value: unknown): ModeLimit | undefined {
  return MODE_LIMIT_FIELD.parse(value).value as ModeLimit | undefined;
}

export function normalizeMode(value: unknown): ThermostatMode {
  return MODE_FIELD.parse(value).value as ThermostatMode;
}

function requiredNumber(field: ThermostatField, fallback: number): ThermostatFieldSpec {
  return {
    field,
    parse(value) {
      return parseRequiredNumberField(field, value, fallback);
    },
  };
}

function requiredEnumNumber(
  field: ThermostatField,
  fallback: number,
  supportedValues: readonly number[],
  options: { preserveUnknown?: boolean } = {},
): ThermostatFieldSpec {
  return {
    field,
    parse(value) {
      const parsed = parseRequiredNumberField(field, value, fallback);
      if (parsed.missingRequired || parsed.invalidRequiredNumber) {
        return parsed;
      }
      if (!supportedValues.includes(parsed.value as number)) {
        return {
          ...parsed,
          value: options.preserveUnknown ? parsed.value : fallback,
          unsupportedEnum: `unsupported ${field} ${String(value)}`,
        };
      }
      return parsed;
    },
  };
}

function optionalNumber(field: ThermostatField): ThermostatFieldSpec {
  return {
    field,
    parse(value) {
      return { value: numberOrUndefined(value) };
    },
  };
}

function optionalEnumNumber(
  field: ThermostatField,
  supportedValues: readonly number[],
  options: { preserveUnknown?: boolean } = {},
): ThermostatFieldSpec {
  return {
    field,
    parse(value) {
      const parsed = numberOrUndefined(value);
      if (parsed === undefined) {
        return { value: undefined };
      }
      if (!supportedValues.includes(parsed)) {
        return {
          value: options.preserveUnknown ? parsed : undefined,
          unsupportedEnum: `unsupported ${field} ${String(value)}`,
        };
      }
      return { value: parsed };
    },
  };
}

function optionalBoolean(field: ThermostatField): ThermostatFieldSpec {
  return {
    field,
    parse(value) {
      return { value: booleanOrUndefined(value) };
    },
  };
}

function optionalBooleanOrNumber(field: ThermostatField): ThermostatFieldSpec {
  return {
    field,
    parse(value) {
      return { value: booleanOrNumberOrUndefined(value) };
    },
  };
}

function parseRequiredNumberField(field: ThermostatField, value: unknown, fallback: number): ParsedThermostatField {
  if (isMissingValue(value)) {
    return {
      value: fallback,
      missingRequired: `missing required field ${field}`,
    };
  }

  const parsed = numberOrUndefined(value);
  if (parsed === undefined) {
    return {
      value: fallback,
      invalidRequiredNumber: `invalid numeric field ${field}`,
    };
  }

  return { value: parsed };
}

function unknownFieldIssues(payload: Record<string, unknown>): string[] {
  return Object.keys(payload)
    .filter(field => !KNOWN_THERMOSTAT_FIELDS.has(field as ThermostatField))
    .map(field => `unexpected field ${field}`);
}

function booleanOrUndefined(value: unknown): boolean | undefined {
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

function booleanOrNumberOrUndefined(value: unknown): number | boolean | undefined {
  if (typeof value === 'boolean') {
    return value;
  }
  return numberOrUndefined(value);
}

function numberOrUndefined(value: unknown): number | undefined {
  const numberValue = numberFrom(value, Number.NaN);
  return Number.isFinite(numberValue) ? numberValue : undefined;
}

function isMissingValue(value: unknown): boolean {
  return value === undefined || value === null || isBlankString(value);
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
