import assert from 'node:assert/strict';
import { test } from 'node:test';

import { normalizeThermostatData, validateThermostatPayload } from '../dist/daikinOpenApiMapper.js';
import { applySetpointPolicy } from '../dist/setpointPolicy.js';

test('normalizes numeric Open API strings into thermostat data', () => {
  const data = normalizeThermostatData({
    equipmentStatus: '3',
    mode: '1',
    modeLimit: '2',
    modeEmHeatAvailable: '1',
    fan: '4',
    fanCirculate: '2',
    fanCirculateSpeed: '1',
    heatSetpoint: '19.5',
    coolSetpoint: '24',
    tempIndoor: '20.25',
    humIndoor: '48',
    tempOutdoor: '6.75',
    humOutdoor: '88',
    scheduleEnabled: '1',
  });

  assert.equal(data.equipmentStatus, 3);
  assert.equal(data.mode, 1);
  assert.equal(data.modeLimit, 2);
  assert.equal(data.modeEmHeatAvailable, 1);
  assert.equal(data.fan, 4);
  assert.equal(data.fanCirculate, 2);
  assert.equal(data.fanCirculateSpeed, 1);
  assert.equal(data.heatSetpoint, 19.5);
  assert.equal(data.coolSetpoint, 24);
  assert.equal(data.tempIndoor, 20.25);
  assert.equal(data.humIndoor, 48);
  assert.equal(data.tempOutdoor, 6.75);
  assert.equal(data.humOutdoor, 88);
  assert.equal(data.scheduleEnabled, true);
});

test('normalizes outdoor, fan, schedule, and emergency heat fields independently', () => {
  const data = normalizeThermostatData({
    equipmentStatus: 4,
    mode: 4,
    modeLimit: 1,
    modeEmHeatAvailable: true,
    fan: 1,
    fanCirculate: 0,
    fanCirculateSpeed: 2,
    heatSetpoint: 21,
    coolSetpoint: 25,
    tempIndoor: 20,
    tempOutdoor: -3.5,
    humOutdoor: 64,
    scheduleEnabled: false,
  });

  assert.equal(data.equipmentStatus, 4);
  assert.equal(data.mode, 4);
  assert.equal(data.modeLimit, 1);
  assert.equal(data.modeEmHeatAvailable, true);
  assert.equal(data.fan, 1);
  assert.equal(data.fanCirculate, 0);
  assert.equal(data.fanCirculateSpeed, 2);
  assert.equal(data.tempOutdoor, -3.5);
  assert.equal(data.humOutdoor, 64);
  assert.equal(data.scheduleEnabled, false);
});

test('falls back to safe mode and placeholder values for invalid payload fields', () => {
  const data = normalizeThermostatData({
    equipmentStatus: Number.NaN,
    mode: 255,
    heatSetpoint: 'not-a-number',
    coolSetpoint: null,
    tempIndoor: undefined,
  });

  assert.equal(data.equipmentStatus, 5);
  assert.equal(data.mode, 0);
  assert.equal(data.heatSetpoint, 20);
  assert.equal(data.coolSetpoint, 24);
  assert.equal(data.tempIndoor, -270);
});

test('keeps auto heat and cool setpoints separated by the Daikin delta', () => {
  const data = normalizeThermostatData({
    equipmentStatus: 5,
    mode: 3,
    heatSetpoint: 20,
    coolSetpoint: 22,
    setpointDelta: 2,
    setpointMinimum: 10,
    setpointMaximum: 35,
    tempIndoor: 21,
  });

  assert.deepEqual(
    applySetpointPolicy(data, {
      mode: 3,
      heatSetpoint: 20,
      coolSetpoint: 20.5,
    }),
    {
      mode: 3,
      heatSetpoint: 18.5,
      coolSetpoint: 20.5,
    },
  );
});

test('validates live Open API payload drift before normalization falls back', () => {
  assert.deepEqual(validateThermostatPayload({
    equipmentStatus: 'fan',
    mode: 255,
    modeLimit: 99,
    heatSetpoint: 20,
    coolSetpoint: 24,
    fanCirculate: 99,
    tempOutdoor: 10,
    vendorAddedField: true,
  }), {
    warnings: [
      'missing required field tempIndoor',
      'invalid numeric field equipmentStatus',
      'unsupported mode 255',
      'unsupported modeLimit 99',
      'unsupported fanCirculate 99',
    ],
    developerNotes: ['unexpected field vendorAddedField'],
  });
});

test('warns for blank required numeric strings before normalization falls back', () => {
  assert.deepEqual(validateThermostatPayload({
    equipmentStatus: ' ',
    mode: '\t',
    heatSetpoint: '  ',
    coolSetpoint: '\n',
    tempIndoor: '\r\n',
  }), {
    warnings: [
      'missing required field equipmentStatus',
      'missing required field mode',
      'missing required field heatSetpoint',
      'missing required field coolSetpoint',
      'missing required field tempIndoor',
    ],
    developerNotes: [],
  });

  const data = normalizeThermostatData({
    equipmentStatus: ' ',
    mode: ' ',
    heatSetpoint: ' ',
    coolSetpoint: ' ',
    tempIndoor: ' ',
  });

  assert.equal(data.equipmentStatus, 5);
  assert.equal(data.mode, 0);
  assert.equal(data.heatSetpoint, 20);
  assert.equal(data.coolSetpoint, 24);
  assert.equal(data.tempIndoor, -270);
});
