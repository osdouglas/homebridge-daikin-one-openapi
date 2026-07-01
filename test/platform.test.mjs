import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DaikinOpenApiPlatform } from '../dist/platform.js';

test('does not register launch discovery when required config is missing', () => {
  const api = fakeApi();
  const log = fakeLog();

  const platform = new DaikinOpenApiPlatform(log, { platform: 'DaikonPlus' }, api);

  assert.equal(api.callbacks.length, 0);
  assert.equal(log.warnMessages.length, 1);
  assert.match(log.warnMessages[0], /not configured/);
  assert.throws(() => platform.config, /config is unavailable/);
  assert.throws(() => platform.client, /client is unavailable/);
});

test('registers launch discovery when required config is present', () => {
  const api = fakeApi();
  const log = fakeLog();

  new DaikinOpenApiPlatform(log, {
    platform: 'DaikonPlus',
    apiKey: 'api-key',
    integratorEmail: 'owner@example.com',
    integratorToken: 'token',
  }, api);

  assert.deepEqual(api.callbacks.map(callback => callback.event), ['didFinishLaunching']);
});

test('registers optional outdoor unit and circulation fan accessories from refreshed device data', async () => {
  const api = fakeApi();
  const log = fakeLog();

  const platform = new DaikinOpenApiPlatform(log, {
    platform: 'DaikonPlus',
    apiKey: 'api-key',
    integratorEmail: 'owner@example.com',
    integratorToken: 'token',
  }, api);
  const staleAccessory = new api.platformAccessory('Stale', 'uuid:stale');
  platform.configureAccessory(staleAccessory);

  const client = platform.client;
  client.initialize = async () => {};
  client.getDeviceList = () => [{ id: 'zone-1', name: 'Downstairs' }];
  client.hasOutdoorData = () => true;
  client.hasFanCirculationData = () => true;
  client.hasScheduleData = () => true;
  client.getSupportedModes = () => [0, 1, 2, 3];
  client.addListener = () => {};

  await platform.discover();

  assert.deepEqual(
    api.registered.map(accessory => accessory.displayName),
    ['Downstairs Thermostat', 'Downstairs Outdoor Unit', 'Downstairs Circulation Fan'],
  );
  assert.deepEqual(
    api.registered.map(accessory => accessory.UUID),
    ['uuid:zone-1:thermostat', 'uuid:zone-1:outdoor-unit', 'uuid:zone-1:circulation-fan'],
  );
  assert.deepEqual(api.unregistered, [staleAccessory]);
});

function fakeApi() {
  const callbacks = [];
  const registered = [];
  const unregistered = [];

  return {
    callbacks,
    registered,
    unregistered,
    hap: {
      Characteristic: fakeCharacteristic(),
      Service: fakeServiceTypes(),
      uuid: {
        generate(value) {
          return `uuid:${value}`;
        },
      },
    },
    on(event, handler) {
      callbacks.push({ event, handler });
    },
    platformAccessory: FakePlatformAccessory,
    registerPlatformAccessories(pluginName, platformName, accessories) {
      registered.push(...accessories);
    },
    unregisterPlatformAccessories(pluginName, platformName, accessories) {
      unregistered.push(...accessories);
    },
  };
}

class FakePlatformAccessory {
  constructor(displayName, uuid) {
    this.displayName = displayName;
    this.UUID = uuid;
    this.context = {};
    this.services = [new FakeService('AccessoryInformation')];
  }

  getService(serviceType) {
    return this.services.find(service => service.serviceType === serviceType);
  }

  getServiceById(serviceType, subtype) {
    return this.services.find(service => service.serviceType === serviceType && service.subtype === subtype);
  }

  addService(serviceType, displayName, subtype) {
    const service = new FakeService(serviceType, subtype);
    service.displayName = displayName;
    this.services.push(service);
    return service;
  }
}

class FakeService {
  constructor(serviceType, subtype) {
    this.serviceType = serviceType;
    this.subtype = subtype;
    this.characteristics = new Map();
  }

  getCharacteristic(characteristic) {
    if (!this.characteristics.has(characteristic)) {
      this.characteristics.set(characteristic, new FakeCharacteristicValue());
    }
    return this.characteristics.get(characteristic);
  }

  setCharacteristic() {
    return this;
  }

  updateCharacteristic() {
    return this;
  }
}

class FakeCharacteristicValue {
  onGet() {
    return this;
  }

  onSet() {
    return this;
  }

  setProps() {
    return this;
  }

  updateValue() {
    return this;
  }
}

function fakeServiceTypes() {
  return {
    AccessoryInformation: 'AccessoryInformation',
    Fanv2: 'Fanv2',
    HumiditySensor: 'HumiditySensor',
    Switch: 'Switch',
    TemperatureSensor: 'TemperatureSensor',
    Thermostat: 'Thermostat',
  };
}

function fakeCharacteristic() {
  return {
    Active: { ACTIVE: 1, INACTIVE: 0 },
    CoolingThresholdTemperature: 'CoolingThresholdTemperature',
    CurrentFanState: { BLOWING_AIR: 2, IDLE: 1, INACTIVE: 0 },
    CurrentHeatingCoolingState: { COOL: 2, HEAT: 1, OFF: 0 },
    CurrentRelativeHumidity: 'CurrentRelativeHumidity',
    CurrentTemperature: 'CurrentTemperature',
    FirmwareRevision: 'FirmwareRevision',
    HeatingThresholdTemperature: 'HeatingThresholdTemperature',
    Manufacturer: 'Manufacturer',
    Model: 'Model',
    Name: 'Name',
    On: 'On',
    RotationSpeed: 'RotationSpeed',
    SerialNumber: 'SerialNumber',
    TargetFanState: { AUTO: 1, MANUAL: 0 },
    TargetHeatingCoolingState: { AUTO: 3, COOL: 2, HEAT: 1, OFF: 0 },
    TargetTemperature: 'TargetTemperature',
    TemperatureDisplayUnits: { CELSIUS: 0 },
  };
}

function fakeLog() {
  const warnMessages = [];

  return {
    warnMessages,
    debug() {},
    error() {},
    info() {},
    warn(message, ...parameters) {
      warnMessages.push(format(message, parameters));
    },
  };
}

function format(message, parameters) {
  return parameters.reduce((formatted, parameter) => formatted.replace('%s', String(parameter)), message);
}
