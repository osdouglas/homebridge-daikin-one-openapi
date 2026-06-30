import type {
  API,
  Characteristic,
  DynamicPlatformPlugin,
  Logging,
  PlatformAccessory,
  PlatformConfig,
  Service,
} from 'homebridge';

import { parsePlatformConfig } from './config.js';
import { DaikinOpenApiClient } from './daikinOpenApiClient.js';
import { DaikinThermostatAccessory } from './thermostatAccessory.js';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings.js';
import type { AccessoryContext, DaikinDevice, DaikinPlatformConfig } from './types.js';

export class DaikinOpenApiPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service;
  public readonly Characteristic: typeof Characteristic;
  private readonly platformConfig?: DaikinPlatformConfig;
  private readonly daikinClient?: DaikinOpenApiClient;
  private readonly accessories: PlatformAccessory<AccessoryContext>[] = [];

  public constructor(
    public readonly log: Logging,
    rawConfig: PlatformConfig,
    public readonly api: API,
  ) {
    this.Service = api.hap.Service;
    this.Characteristic = api.hap.Characteristic;

    const parsed = parsePlatformConfig(rawConfig);
    if (!parsed.ok) {
      this.log.warn(
        'Daikin Open API platform is not configured. Missing required value(s): %s',
        parsed.missing.join(', '),
      );
      return;
    }

    this.platformConfig = parsed.config;
    this.daikinClient = new DaikinOpenApiClient(this.platformConfig, log);

    api.on('didFinishLaunching', () => {
      void this.discover();
    });
  }

  public configureAccessory(accessory: PlatformAccessory<AccessoryContext>): void {
    this.log.info('Loading accessory from cache: %s', accessory.displayName);
    this.accessories.push(accessory);
  }

  public get client(): DaikinOpenApiClient {
    if (!this.daikinClient) {
      throw new Error('Daikin Open API client is unavailable because the platform is not configured.');
    }
    return this.daikinClient;
  }

  public get config(): DaikinPlatformConfig {
    if (!this.platformConfig) {
      throw new Error('Daikin Open API config is unavailable because the platform is not configured.');
    }
    return this.platformConfig;
  }

  public accessoryName(device: DaikinDevice, suffix: string): string {
    if (this.config.includeDeviceName) {
      return suffix ? `${device.name} ${suffix}` : device.name;
    }
    return suffix || this.config.name;
  }

  private async discover(): Promise<void> {
    if (!this.daikinClient) {
      return;
    }

    try {
      await this.daikinClient.initialize();
    } catch (error) {
      this.log.error('Daikin Open API discovery failed.');
      this.log.error(error instanceof Error ? error.message : String(error));
      return;
    }

    const activeAccessoryIds = new Set<string>();
    for (const device of this.daikinClient.getDeviceList()) {
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
}
