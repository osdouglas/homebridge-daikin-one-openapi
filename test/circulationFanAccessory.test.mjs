import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DaikinCirculationFanAccessory } from '../dist/circulationFanAccessory.js';

test('turns inactive circulation fan on in manual mode', async () => {
  const { accessory, client, characteristic } = fixture({
    fanCirculate: 0,
    fanCirculateSpeed: 1,
  });

  new DaikinCirculationFanAccessory(platform(client, characteristic), accessory, 'zone-1');
  const active = accessory.getService('Fanv2').getCharacteristic(characteristic.Active);

  assert.equal(await active.get(), characteristic.Active.INACTIVE);
  await active.set(characteristic.Active.ACTIVE);

  assert.deepEqual(client.fanWrites, [
    {
      deviceId: 'zone-1',
      update: {
        fanCirculate: 1,
        fanCirculateSpeed: 1,
      },
    },
  ]);
});

test('reserves zero rotation speed for inactive circulation fan', async () => {
  const { accessory, client, characteristic } = fixture({
    fanCirculate: 1,
    fanCirculateSpeed: 0,
  });

  new DaikinCirculationFanAccessory(platform(client, characteristic), accessory, 'zone-1');
  const rotationSpeed = accessory.getService('Fanv2').getCharacteristic(characteristic.RotationSpeed);

  assert.equal(await rotationSpeed.get(), 33);

  client.fanCirculate = 0;
  assert.equal(await rotationSpeed.get(), 0);
  assert.equal(await accessory.getService('Fanv2').getCharacteristic(characteristic.Active).get(), characteristic.Active.INACTIVE);
});

function fixture({ fanCirculate, fanCirculateSpeed }) {
  const characteristic = fakeCharacteristic();
  const client = {
    fanCirculate,
    fanCirculateSpeed,
    fanWrites: [],
    addListener() {},
    getCurrentStatus() {
      return 5;
    },
    getFanCirculate() {
      return this.fanCirculate;
    },
    getFanCirculateSpeed() {
      return this.fanCirculateSpeed;
    },
    requestRefreshNow() {},
    async setFanCirculation(deviceId, update) {
      this.fanWrites.push({ deviceId, update });
      this.fanCirculate = update.fanCirculate;
      this.fanCirculateSpeed = update.fanCirculateSpeed;
      return true;
    },
  };

  return {
    accessory: new FakePlatformAccessory('Downstairs Circulation Fan', 'uuid:zone-1:circulation-fan'),
    characteristic,
    client,
  };
}

function platform(client, characteristic = fakeCharacteristic()) {
  return {
    Characteristic: characteristic,
    Service: fakeServiceTypes(),
    client,
  };
}

class FakePlatformAccessory {
  constructor(displayName, uuid) {
    this.displayName = displayName;
    this.UUID = uuid;
    this.context = {
      device: {
        id: 'zone-1',
        name: 'Downstairs',
      },
    };
    this.services = [new FakeService('AccessoryInformation')];
  }

  getService(serviceType) {
    return this.services.find(service => service.serviceType === serviceType);
  }

  addService(serviceType) {
    const service = new FakeService(serviceType);
    this.services.push(service);
    return service;
  }
}

class FakeService {
  constructor(serviceType) {
    this.serviceType = serviceType;
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
}

class FakeCharacteristicValue {
  onGet(handler) {
    this.getHandler = handler;
    return this;
  }

  onSet(handler) {
    this.setHandler = handler;
    return this;
  }

  setProps(props) {
    this.props = props;
    return this;
  }

  async get() {
    return this.getHandler();
  }

  async set(value) {
    await this.setHandler(value);
  }
}

function fakeServiceTypes() {
  return {
    AccessoryInformation: 'AccessoryInformation',
    Fanv2: 'Fanv2',
  };
}

function fakeCharacteristic() {
  return {
    Active: { ACTIVE: 1, INACTIVE: 0 },
    CurrentFanState: { BLOWING_AIR: 2, IDLE: 1, INACTIVE: 0 },
    FirmwareRevision: 'FirmwareRevision',
    Manufacturer: 'Manufacturer',
    Model: 'Model',
    Name: 'Name',
    RotationSpeed: 'RotationSpeed',
    SerialNumber: 'SerialNumber',
    TargetFanState: { AUTO: 1, MANUAL: 0 },
  };
}
