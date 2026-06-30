import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import { DaikinOpenApiClient } from '../dist/daikinOpenApiClient.js';

const tokenUrl = 'https://integrator-api.daikinskyport.com/v1/token';
const devicesUrl = 'https://integrator-api.daikinskyport.com/v1/devices';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test('discovers devices and normalizes Open API thermostat data', async () => {
  const { calls, installFetch } = fetchQueue([
    jsonResponse({ accessToken: 'token-1', accessTokenExpiresIn: 3600 }),
    jsonResponse([
      {
        locationName: 'Home',
        devices: [
          {
            id: 'zone-1',
            name: 'Downstairs',
            model: 'Daikin One+',
            firmwareVersion: '1.2.3',
          },
        ],
      },
    ]),
    jsonResponse({
      equipmentStatus: '5',
      mode: '3',
      heatSetpoint: '20',
      coolSetpoint: '24',
      setpointDelta: '2',
      setpointMinimum: '10',
      setpointMaximum: '35',
      tempIndoor: '21.5',
      humIndoor: '42',
      scheduleEnabled: 'true',
    }),
  ]);
  installFetch();

  const client = new DaikinOpenApiClient(config(), log());

  await client.initialize();

  assert.equal(calls[0].url, tokenUrl);
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[1].url, devicesUrl);
  assert.equal(calls[2].url, `${devicesUrl}/zone-1`);
  assert.deepEqual(client.getDeviceList().map(device => device.id), ['zone-1']);
  assert.equal(client.getMode('zone-1'), 3);
  assert.equal(client.getCurrentStatus('zone-1'), 5);
  assert.equal(client.getTargetTemperature('zone-1'), 20);
  assert.equal(client.getHeatingThreshold('zone-1'), 20);
  assert.equal(client.getCoolingThreshold('zone-1'), 24);
  assert.equal(client.getCurrentTemperature('zone-1'), 21.5);
  assert.equal(client.getCurrentHumidity('zone-1'), 42);
});

test('writes msp payloads with Daikin auto-mode setpoint separation', async () => {
  const { calls, installFetch } = fetchQueue([
    jsonResponse({ accessToken: 'token-1', accessTokenExpiresIn: 3600 }),
    jsonResponse([
      {
        locationName: 'Home',
        devices: [{ id: 'zone-1', name: 'Downstairs' }],
      },
    ]),
    jsonResponse({
      equipmentStatus: 5,
      mode: 3,
      heatSetpoint: 20,
      coolSetpoint: 22,
      setpointDelta: 2,
      setpointMinimum: 10,
      setpointMaximum: 35,
      tempIndoor: 21,
    }),
    emptyResponse(),
  ]);
  installFetch();

  const client = new DaikinOpenApiClient(config(), log());

  await client.initialize();
  const didWrite = await client.setThresholds('zone-1', undefined, 20.5);

  assert.equal(didWrite, true);
  const writeCall = calls.at(-1);
  assert.equal(writeCall.url, `${devicesUrl}/zone-1/msp`);
  assert.equal(writeCall.init.method, 'PUT');
  assert.deepEqual(JSON.parse(writeCall.init.body), {
    mode: 3,
    heatSetpoint: 18.5,
    coolSetpoint: 20.5,
  });
  assert.equal(client.getHeatingThreshold('zone-1'), 18.5);
  assert.equal(client.getCoolingThreshold('zone-1'), 20.5);
});

test('readonly mode skips writes without calling the Open API', async () => {
  const { calls, installFetch } = fetchQueue([
    jsonResponse({ accessToken: 'token-1', accessTokenExpiresIn: 3600 }),
    jsonResponse([
      {
        locationName: 'Home',
        devices: [{ id: 'zone-1', name: 'Downstairs' }],
      },
    ]),
    jsonResponse({
      equipmentStatus: 5,
      mode: 1,
      heatSetpoint: 20,
      coolSetpoint: 24,
      tempIndoor: 21,
    }),
  ]);
  installFetch();

  const client = new DaikinOpenApiClient(config({ readonly: true }), log());

  await client.initialize();
  const didWrite = await client.setTargetTemperature('zone-1', 21);

  assert.equal(didWrite, false);
  assert.equal(calls.length, 3);
});

function config(overrides = {}) {
  return {
    name: 'Daikin One',
    apiKey: 'api-key',
    integratorEmail: 'test@example.com',
    integratorToken: 'integrator-token',
    pollIntervalSeconds: 180,
    requestTimeoutSeconds: 5,
    includeDeviceName: true,
    deviceIds: [],
    readonly: false,
    debug: false,
    logRaw: false,
    ...overrides,
  };
}

function log() {
  return {
    debug() {},
    error() {},
    info() {},
    warn() {},
  };
}

function fetchQueue(responses) {
  const calls = [];

  return {
    calls,
    installFetch() {
      globalThis.fetch = async (url, init = {}) => {
        const response = responses.shift();
        assert.ok(response, `Unexpected fetch call to ${url}`);
        calls.push({ url: String(url), init });
        return response;
      };
    },
  };
}

function jsonResponse(body, init = {}) {
  return response({
    ...init,
    body: JSON.stringify(body),
  });
}

function emptyResponse(init = {}) {
  return response(init);
}

function response({ ok = true, status = 200, statusText = 'OK', body = '' } = {}) {
  return {
    ok,
    status,
    statusText,
    async text() {
      return body;
    },
  };
}
