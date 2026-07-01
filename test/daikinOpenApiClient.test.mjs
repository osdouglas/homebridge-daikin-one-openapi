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
      tempOutdoor: '5.5',
      humOutdoor: '86',
      fan: '4',
      fanCirculate: '2',
      fanCirculateSpeed: '1',
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
  assert.equal(client.getDevice('zone-1').data.tempOutdoor, 5.5);
  assert.equal(client.getDevice('zone-1').data.humOutdoor, 86);
  assert.equal(client.getDevice('zone-1').data.fan, 4);
  assert.equal(client.getDevice('zone-1').data.fanCirculate, 2);
  assert.equal(client.getDevice('zone-1').data.fanCirculateSpeed, 1);
  assert.equal(client.getDevice('zone-1').data.scheduleEnabled, true);
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
      scheduleEnabled: true,
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
  assert.equal(client.getScheduleEnabled('zone-1'), false);
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

test('writes schedule payloads to the Daikin schedule endpoint', async () => {
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
      scheduleEnabled: true,
    }),
    emptyResponse(),
  ]);
  installFetch();

  const client = new DaikinOpenApiClient(config(), log());

  await client.initialize();
  const didWrite = await client.setScheduleEnabled('zone-1', false);

  assert.equal(didWrite, true);
  const writeCall = calls.at(-1);
  assert.equal(writeCall.url, `${devicesUrl}/zone-1/schedule`);
  assert.equal(writeCall.init.method, 'PUT');
  assert.deepEqual(JSON.parse(writeCall.init.body), {
    scheduleEnabled: false,
  });
  assert.equal(client.getDevice('zone-1').data.scheduleEnabled, false);
});

test('writes circulation fan payloads to the Daikin fan endpoint', async () => {
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
      fanCirculate: 0,
      fanCirculateSpeed: 0,
      heatSetpoint: 20,
      coolSetpoint: 24,
      tempIndoor: 21,
    }),
    emptyResponse(),
  ]);
  installFetch();

  const client = new DaikinOpenApiClient(config(), log());

  await client.initialize();
  const didWrite = await client.setFanCirculation('zone-1', {
    fanCirculate: 1,
    fanCirculateSpeed: 2,
  });

  assert.equal(didWrite, true);
  const writeCall = calls.at(-1);
  assert.equal(writeCall.url, `${devicesUrl}/zone-1/fan`);
  assert.equal(writeCall.init.method, 'PUT');
  assert.deepEqual(JSON.parse(writeCall.init.body), {
    fanCirculate: 1,
    fanCirculateSpeed: 2,
  });
  assert.equal(client.getDevice('zone-1').data.fanCirculate, 1);
  assert.equal(client.getDevice('zone-1').data.fanCirculateSpeed, 2);
});

test('skips schedule and fan writes when current device data does not expose those fields', async () => {
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

  const client = new DaikinOpenApiClient(config(), log());

  await client.initialize();

  assert.equal(await client.setScheduleEnabled('zone-1', false), false);
  assert.equal(await client.setFanCirculation('zone-1', {
    fanCirculate: 1,
    fanCirculateSpeed: 2,
  }), false);
  assert.equal(calls.length, 3);
});

test('blocks unsupported mode writes before calling the Daikin msp endpoint', async () => {
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
      modeLimit: 2,
      heatSetpoint: 20,
      coolSetpoint: 24,
      tempIndoor: 21,
    }),
  ]);
  installFetch();

  const client = new DaikinOpenApiClient(config(), log());

  await client.initialize();
  const didWrite = await client.setMode('zone-1', 2);

  assert.equal(didWrite, false);
  assert.equal(calls.length, 3);
  assert.equal(client.getMode('zone-1'), 1);
});

test('preserves emergency heat mode when writing setpoints', async () => {
  const { calls, installFetch } = fetchQueue([
    jsonResponse({ accessToken: 'token-1', accessTokenExpiresIn: 3600 }),
    jsonResponse([
      {
        locationName: 'Home',
        devices: [{ id: 'zone-1', name: 'Downstairs' }],
      },
    ]),
    jsonResponse({
      equipmentStatus: 3,
      mode: 4,
      modeEmHeatAvailable: true,
      heatSetpoint: 20,
      coolSetpoint: 24,
      tempIndoor: 19,
    }),
    emptyResponse(),
  ]);
  installFetch();

  const client = new DaikinOpenApiClient(config(), log());

  await client.initialize();
  assert.equal(client.getMode('zone-1'), 4);

  const didWrite = await client.setTargetTemperature('zone-1', 21);

  assert.equal(didWrite, true);
  const writeCall = calls.at(-1);
  assert.equal(writeCall.url, `${devicesUrl}/zone-1/msp`);
  assert.deepEqual(JSON.parse(writeCall.init.body), {
    mode: 4,
    heatSetpoint: 21,
    coolSetpoint: 24,
  });
  assert.equal(client.getMode('zone-1'), 4);
  assert.equal(client.getTargetTemperature('zone-1'), 21);
});

test('logs payload validation warnings while keeping safe normalized state', async () => {
  const warnings = [];
  const { installFetch } = fetchQueue([
    jsonResponse({ accessToken: 'token-1', accessTokenExpiresIn: 3600 }),
    jsonResponse([
      {
        locationName: 'Home',
        devices: [{ id: 'zone-1', name: 'Downstairs' }],
      },
    ]),
    jsonResponse({
      equipmentStatus: 5,
      mode: 255,
      heatSetpoint: 20,
      coolSetpoint: 24,
      tempIndoor: 21,
    }),
  ]);
  installFetch();

  const client = new DaikinOpenApiClient(config(), log({ warnings }));

  await client.initialize();

  assert.equal(client.getMode('zone-1'), 0);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /unsupported mode 255/);
});

test('keeps unknown payload fields out of default warnings', async () => {
  const infos = [];
  const warnings = [];
  const { installFetch } = fetchQueue([
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
      vendorAddedField: true,
    }),
  ]);
  installFetch();

  const client = new DaikinOpenApiClient(config(), log({ infos, warnings }));

  await client.initialize();

  assert.deepEqual(warnings, []);
  assert.equal(infos.some(message => message.includes('Daikin payload developer note')), false);
});

test('logs unknown payload fields as developer notes only in developer mode', async () => {
  const infos = [];
  const warnings = [];
  const { installFetch } = fetchQueue([
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
      vendorAddedField: true,
    }),
  ]);
  installFetch();

  const client = new DaikinOpenApiClient(config({ developerMode: true }), log({ infos, warnings }));

  await client.initialize();

  assert.deepEqual(warnings, []);
  assert.equal(infos.some(message => message.includes('Daikin payload developer note')), true);
});

test('refreshes expired access tokens before writes', async () => {
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
    jsonResponse({ accessToken: 'token-2', accessTokenExpiresIn: 3600 }),
    emptyResponse(),
  ]);
  installFetch();

  const client = new DaikinOpenApiClient(config(), log());

  await client.initialize();
  client.tokenExpiresAtMs = 0;
  const didWrite = await client.setTargetTemperature('zone-1', 21);

  assert.equal(didWrite, true);
  assert.deepEqual(
    calls.filter(call => call.url === tokenUrl).map(call => JSON.parse(call.init.body)),
    [
      { email: 'test@example.com', integratorToken: 'integrator-token' },
      { email: 'test@example.com', integratorToken: 'integrator-token' },
    ],
  );
  assert.equal(calls.at(-1).init.headers.Authorization, 'Bearer token-2');
});

function config(overrides = {}) {
  return {
    name: 'Daikon Plus',
    apiKey: 'api-key',
    integratorEmail: 'test@example.com',
    integratorToken: 'integrator-token',
    pollIntervalSeconds: 180,
    requestTimeoutSeconds: 5,
    includeDeviceName: true,
    deviceIds: [],
    readonly: false,
    developerMode: false,
    ...overrides,
  };
}

function log({ infos = [], warnings = [] } = {}) {
  return {
    debug() {},
    error() {},
    info(message, ...parameters) {
      infos.push([message, ...parameters].join(' '));
    },
    warn(message, ...parameters) {
      warnings.push([message, ...parameters].join(' '));
    },
  };
}

function fetchQueue(responses) {
  const calls = [];

  return {
    calls,
    installFetch() {
      globalThis.fetch = async (url, init = {}) => {
        const response = responses.shift();
        calls.push({ url: String(url), init });
        assert.ok(response, `Unexpected fetch call to ${url}`);
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
