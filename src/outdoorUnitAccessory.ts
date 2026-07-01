import type { CharacteristicValue, PlatformAccessory, Service } from 'homebridge';

import type { DaikinOpenApiPlatform } from './platform.js';
import type { AccessoryContext } from './types.js';

export class DaikinOutdoorUnitAccessory {
  private readonly humidityService: Service;
  private readonly temperatureService: Service;

  public constructor(
    private readonly platform: DaikinOpenApiPlatform,
    accessory: PlatformAccessory<AccessoryContext>,
    private readonly deviceId: string,
  ) {
    const device = accessory.context.device;

    accessory
      .getService(platform.Service.AccessoryInformation)!
      .setCharacteristic(platform.Characteristic.Manufacturer, 'Daikin')
      .setCharacteristic(platform.Characteristic.Model, device.model ?? 'Daikin Outdoor Unit')
      .setCharacteristic(platform.Characteristic.SerialNumber, `${device.id}:outdoor-unit`)
      .setCharacteristic(platform.Characteristic.FirmwareRevision, device.firmwareVersion ?? 'unknown');

    this.temperatureService =
      accessory.getService(platform.Service.TemperatureSensor) ?? accessory.addService(platform.Service.TemperatureSensor);
    this.temperatureService.setCharacteristic(platform.Characteristic.Name, `${accessory.displayName} Temperature`);
    this.temperatureService.getCharacteristic(platform.Characteristic.CurrentTemperature).onGet(() => {
      this.platform.client.requestRefreshNow();
      return this.getOutdoorTemperature();
    });

    this.humidityService =
      accessory.getService(platform.Service.HumiditySensor) ?? accessory.addService(platform.Service.HumiditySensor);
    this.humidityService.setCharacteristic(platform.Characteristic.Name, `${accessory.displayName} Humidity`);
    this.humidityService.getCharacteristic(platform.Characteristic.CurrentRelativeHumidity).onGet(() => {
      this.platform.client.requestRefreshNow();
      return this.getOutdoorHumidity();
    });

    this.platform.client.addListener(this.deviceId, this.updateValues.bind(this));
  }

  private updateValues(): void {
    const characteristic = this.platform.Characteristic;

    this.temperatureService.updateCharacteristic(characteristic.CurrentTemperature, this.getOutdoorTemperature());
    this.humidityService.updateCharacteristic(characteristic.CurrentRelativeHumidity, this.getOutdoorHumidity());
  }

  private getOutdoorTemperature(): CharacteristicValue {
    return this.clamp(this.platform.client.getOutdoorTemperature(this.deviceId), -270, 100);
  }

  private getOutdoorHumidity(): CharacteristicValue {
    return this.clamp(this.platform.client.getOutdoorHumidity(this.deviceId), 0, 100);
  }

  private clamp(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) {
      return min;
    }
    return Math.min(max, Math.max(min, value));
  }
}
