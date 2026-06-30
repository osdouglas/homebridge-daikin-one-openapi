import type { CharacteristicValue, PlatformAccessory, Service } from 'homebridge';

import type { DaikinOpenApiPlatform } from './platform.js';
import { EquipmentStatus, ThermostatMode, type AccessoryContext } from './types.js';

export class DaikinThermostatAccessory {
  private readonly service: Service;

  public constructor(
    private readonly platform: DaikinOpenApiPlatform,
    accessory: PlatformAccessory<AccessoryContext>,
    private readonly deviceId: string,
  ) {
    const device = accessory.context.device;

    accessory
      .getService(platform.Service.AccessoryInformation)!
      .setCharacteristic(platform.Characteristic.Manufacturer, 'Daikin')
      .setCharacteristic(platform.Characteristic.Model, device.model ?? 'Daikin One+')
      .setCharacteristic(platform.Characteristic.SerialNumber, device.id)
      .setCharacteristic(platform.Characteristic.FirmwareRevision, device.firmwareVersion ?? 'unknown');

    this.service = accessory.getService(platform.Service.Thermostat) ?? accessory.addService(platform.Service.Thermostat);
    this.service.setCharacteristic(platform.Characteristic.Name, accessory.displayName);

    this.service.getCharacteristic(platform.Characteristic.CurrentHeatingCoolingState).onGet(() => {
      this.platform.client.requestRefreshNow();
      return this.getCurrentHeatingCoolingState();
    });

    this.service
      .getCharacteristic(platform.Characteristic.TargetHeatingCoolingState)
      .onGet(() => {
        this.platform.client.requestRefreshNow();
        return this.getTargetHeatingCoolingState();
      })
      .onSet(this.setTargetHeatingCoolingState.bind(this));

    this.service.getCharacteristic(platform.Characteristic.CurrentTemperature).onGet(() => {
      this.platform.client.requestRefreshNow();
      return this.clamp(this.platform.client.getCurrentTemperature(this.deviceId), -270, 100);
    });

    this.service
      .getCharacteristic(platform.Characteristic.TargetTemperature)
      .setProps(this.temperatureProps())
      .onGet(() => {
        this.platform.client.requestRefreshNow();
        const props = this.temperatureProps();
        return this.clamp(this.platform.client.getTargetTemperature(this.deviceId), props.minValue, props.maxValue);
      })
      .onSet(async value => {
        await this.platform.client.setTargetTemperature(this.deviceId, Number(value));
      });

    this.service
      .getCharacteristic(platform.Characteristic.HeatingThresholdTemperature)
      .setProps(this.heatingThresholdProps())
      .onGet(() => {
        this.platform.client.requestRefreshNow();
        const props = this.heatingThresholdProps();
        return this.clamp(this.platform.client.getHeatingThreshold(this.deviceId), props.minValue, props.maxValue);
      })
      .onSet(async value => {
        await this.platform.client.setThresholds(this.deviceId, Number(value), undefined);
      });

    this.service
      .getCharacteristic(platform.Characteristic.CoolingThresholdTemperature)
      .setProps(this.coolingThresholdProps())
      .onGet(() => {
        this.platform.client.requestRefreshNow();
        const props = this.coolingThresholdProps();
        return this.clamp(this.platform.client.getCoolingThreshold(this.deviceId), props.minValue, props.maxValue);
      })
      .onSet(async value => {
        await this.platform.client.setThresholds(this.deviceId, undefined, Number(value));
      });

    this.service.getCharacteristic(platform.Characteristic.CurrentRelativeHumidity).onGet(() => {
      this.platform.client.requestRefreshNow();
      return this.clamp(this.platform.client.getCurrentHumidity(this.deviceId), 0, 100);
    });

    this.service
      .getCharacteristic(platform.Characteristic.TemperatureDisplayUnits)
      .updateValue(platform.Characteristic.TemperatureDisplayUnits.CELSIUS);

    this.platform.client.addListener(this.deviceId, this.updateValues.bind(this));
  }

  private updateValues(): void {
    const characteristic = this.platform.Characteristic;
    const temperatureProps = this.temperatureProps();
    const heatingProps = this.heatingThresholdProps();
    const coolingProps = this.coolingThresholdProps();

    this.service.getCharacteristic(characteristic.TargetTemperature).setProps(temperatureProps);
    this.service.getCharacteristic(characteristic.HeatingThresholdTemperature).setProps(heatingProps);
    this.service.getCharacteristic(characteristic.CoolingThresholdTemperature).setProps(coolingProps);
    this.service.updateCharacteristic(characteristic.CurrentHeatingCoolingState, this.getCurrentHeatingCoolingState());
    this.service.updateCharacteristic(characteristic.TargetHeatingCoolingState, this.getTargetHeatingCoolingState());
    this.service.updateCharacteristic(
      characteristic.CurrentTemperature,
      this.clamp(this.platform.client.getCurrentTemperature(this.deviceId), -270, 100),
    );
    this.service.updateCharacteristic(
      characteristic.TargetTemperature,
      this.clamp(this.platform.client.getTargetTemperature(this.deviceId), temperatureProps.minValue, temperatureProps.maxValue),
    );
    this.service.updateCharacteristic(
      characteristic.HeatingThresholdTemperature,
      this.clamp(this.platform.client.getHeatingThreshold(this.deviceId), heatingProps.minValue, heatingProps.maxValue),
    );
    this.service.updateCharacteristic(
      characteristic.CoolingThresholdTemperature,
      this.clamp(this.platform.client.getCoolingThreshold(this.deviceId), coolingProps.minValue, coolingProps.maxValue),
    );
    this.service.updateCharacteristic(
      characteristic.CurrentRelativeHumidity,
      this.clamp(this.platform.client.getCurrentHumidity(this.deviceId), 0, 100),
    );
  }

  private getCurrentHeatingCoolingState(): CharacteristicValue {
    switch (this.platform.client.getCurrentStatus(this.deviceId)) {
      case EquipmentStatus.COOLING:
      case EquipmentStatus.OVERCOOL_DEHUMIDIFYING:
        return this.platform.Characteristic.CurrentHeatingCoolingState.COOL;
      case EquipmentStatus.HEATING:
        return this.platform.Characteristic.CurrentHeatingCoolingState.HEAT;
      default:
        return this.platform.Characteristic.CurrentHeatingCoolingState.OFF;
    }
  }

  private getTargetHeatingCoolingState(): CharacteristicValue {
    switch (this.platform.client.getMode(this.deviceId)) {
      case ThermostatMode.HEAT:
      case ThermostatMode.EMERGENCY_HEAT:
        return this.platform.Characteristic.TargetHeatingCoolingState.HEAT;
      case ThermostatMode.COOL:
        return this.platform.Characteristic.TargetHeatingCoolingState.COOL;
      case ThermostatMode.AUTO:
        return this.platform.Characteristic.TargetHeatingCoolingState.AUTO;
      default:
        return this.platform.Characteristic.TargetHeatingCoolingState.OFF;
    }
  }

  private async setTargetHeatingCoolingState(value: CharacteristicValue): Promise<void> {
    let mode = ThermostatMode.OFF;

    switch (value) {
      case this.platform.Characteristic.TargetHeatingCoolingState.HEAT:
        mode = ThermostatMode.HEAT;
        break;
      case this.platform.Characteristic.TargetHeatingCoolingState.COOL:
        mode = ThermostatMode.COOL;
        break;
      case this.platform.Characteristic.TargetHeatingCoolingState.AUTO:
        mode = ThermostatMode.AUTO;
        break;
      case this.platform.Characteristic.TargetHeatingCoolingState.OFF:
      default:
        mode = ThermostatMode.OFF;
        break;
    }

    await this.platform.client.setMode(this.deviceId, mode);
  }

  private clamp(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) {
      return min;
    }
    return Math.min(max, Math.max(min, value));
  }

  private temperatureProps(): { minValue: number; maxValue: number; minStep: number } {
    return {
      minValue: this.platform.client.getSetpointMinimum(this.deviceId),
      maxValue: this.platform.client.getSetpointMaximum(this.deviceId),
      minStep: 0.5,
    };
  }

  private heatingThresholdProps(): { minValue: number; maxValue: number; minStep: number } {
    const minimum = this.platform.client.getSetpointMinimum(this.deviceId);
    const maximum = this.platform.client.getSetpointMaximum(this.deviceId);
    const delta = this.platform.client.getSetpointDelta(this.deviceId);

    return {
      minValue: minimum,
      maxValue: Math.max(minimum, maximum - delta),
      minStep: 0.5,
    };
  }

  private coolingThresholdProps(): { minValue: number; maxValue: number; minStep: number } {
    const minimum = this.platform.client.getSetpointMinimum(this.deviceId);
    const maximum = this.platform.client.getSetpointMaximum(this.deviceId);
    const delta = this.platform.client.getSetpointDelta(this.deviceId);

    return {
      minValue: Math.min(maximum, minimum + delta),
      maxValue: maximum,
      minStep: 0.5,
    };
  }
}
