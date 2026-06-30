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

function fakeApi() {
  const callbacks = [];

  return {
    callbacks,
    hap: {
      Characteristic: {},
      Service: {},
      uuid: {
        generate(value) {
          return `uuid:${value}`;
        },
      },
    },
    on(event, handler) {
      callbacks.push({ event, handler });
    },
    platformAccessory: class {},
    registerPlatformAccessories() {},
    unregisterPlatformAccessories() {},
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
