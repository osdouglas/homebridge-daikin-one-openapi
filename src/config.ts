import type { PlatformConfig } from 'homebridge';

import { DEFAULT_PLATFORM_NAME } from './settings.js';
import type { DaikinPlatformConfig } from './types.js';

export interface ConfigParseSuccess {
  ok: true;
  config: DaikinPlatformConfig;
}

export interface ConfigParseFailure {
  ok: false;
  missing: string[];
}

export type ConfigParseResult = ConfigParseSuccess | ConfigParseFailure;

export function parsePlatformConfig(config: PlatformConfig): ConfigParseResult {
  const requiredStrings = ['apiKey', 'integratorEmail', 'integratorToken'] as const;
  const missing = requiredStrings.filter(key => typeof config[key] !== 'string' || config[key].trim().length === 0);

  if (missing.length > 0) {
    return {
      ok: false,
      missing: [...missing],
    };
  }

  return {
    ok: true,
    config: {
      name: typeof config.name === 'string' && config.name.length > 0 ? config.name : DEFAULT_PLATFORM_NAME,
      apiKey: String(config.apiKey),
      integratorEmail: String(config.integratorEmail),
      integratorToken: String(config.integratorToken),
      pollIntervalSeconds: typeof config.pollIntervalSeconds === 'number' ? Math.max(180, config.pollIntervalSeconds) : 180,
      requestTimeoutSeconds: typeof config.requestTimeoutSeconds === 'number' ? Math.max(1, config.requestTimeoutSeconds) : 20,
      includeDeviceName: config.includeDeviceName !== false,
      deviceIds: Array.isArray(config.deviceIds) ? config.deviceIds.filter((id): id is string => typeof id === 'string') : [],
      readonly: Boolean(config.readonly),
      developerMode: Boolean(config.developerMode),
    },
  };
}
