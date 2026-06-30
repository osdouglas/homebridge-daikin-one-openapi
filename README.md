# homebridge-daikin-one-openapi

Homebridge platform plugin for Daikin One+ thermostats using the Daikin One Open API integration-token flow.

The plugin authenticates with `apiKey`, `integratorEmail`, and `integratorToken` against `https://integrator-api.daikinskyport.com`.

## Target Setup

The first target system is a Daikin FIT communicating HVAC system with a DH6V communicating air handler, Daikin One+ Smart Thermostat, and dual-zone configuration managed through the SkyportHome / Daikin One cloud platform.

Each device returned by the Open API is exposed as a HomeKit thermostat accessory. If your zoned system exposes each zone as a separate API device, Homebridge will create a thermostat for each zone. If the Open API returns one parent thermostat with embedded zone data instead, the raw payload can be logged with `logRaw` so zone support can be extended against your actual response shape.

## Configuration

When installed in Homebridge, the plugin exposes `apiKey`, `integratorEmail`, and `integratorToken` in the Homebridge UI. The API key and integration token are rendered as password fields by `config.schema.json`, so they can be entered during configuration without hard-coding them in this repository.

```json
{
  "platform": "DaikinOneOpenAPI",
  "name": "Daikin One",
  "apiKey": "your-daikin-open-api-key",
  "integratorEmail": "email-used-in-the-daikin-one-app@example.com",
  "integratorToken": "your-integrator-token",
  "pollIntervalSeconds": 180,
  "requestTimeoutSeconds": 20,
  "includeDeviceName": true,
  "readonly": false,
  "debug": false,
  "logRaw": false
}
```

Open API polling is kept at a minimum of 180 seconds to respect Daikin Open API rate guidance.

`deviceIds` can be used to expose only selected thermostats/zones after discovery. Leave it empty at first, enable `debug` temporarily, and the startup log will show the device count returned by the Open API.

## Testing With Real Credentials

Do not put a real Daikin token in a file committed to this repository. For manual testing, use a separate Homebridge instance or child bridge and enter the Open API values through Homebridge UI.

A local test `config.json` should live outside the repo, for example in `~/.homebridge-daikin-test/config.json`:

```json
{
  "bridge": {
    "name": "Daikin Test Bridge",
    "username": "0E:11:22:33:44:55",
    "port": 51877,
    "pin": "031-45-154"
  },
  "platforms": [
    {
      "platform": "DaikinOneOpenAPI",
      "name": "Daikin One",
      "apiKey": "your-daikin-open-api-key",
      "integratorEmail": "email-used-in-the-daikin-one-app@example.com",
      "integratorToken": "your-integrator-token",
      "readonly": true,
      "debug": true,
      "logRaw": true
    }
  ]
}
```

Start in `readonly` mode first. Once discovery and state updates look right, set `logRaw` back to `false`, then set `readonly` to `false` for write testing.

## Notes

- HomeKit expects Celsius values for thermostat characteristics. Daikin One Open API temperature values are treated as Celsius.
- Writes use `PUT /v1/devices/{deviceId}/msp` with `mode`, `heatSetpoint`, and `coolSetpoint`.
- Setpoint min, max, and auto-mode heat/cool separation are read from the Open API when present.
- Set `readonly` to `true` while validating a new system if you want HomeKit to display state without sending mode or setpoint changes.
- Set `logRaw` only temporarily. It may log device IDs and detailed HVAC state. This is the first thing to enable if your dual-zone system appears in the Daikin One app but Homebridge only creates one thermostat; the raw response will show whether Daikin exposes zones as separate devices or nested data.

## Development

Use any Node setup you prefer that satisfies the `engines.node` range in `package.json`. The repository includes a `pnpm-lock.yaml`, so the examples below use pnpm.

```sh
pnpm install
pnpm build
pnpm test
```

The unit tests use Node's built-in `node:test` runner and import the compiled files from `dist`. The `test` script builds first, then runs `test/*.test.mjs`.

Using npm is also fine for local development:

```sh
npm install
npm test
```

Keep unit tests focused on the thin adapter behavior: mocked Open API responses in, Homebridge/HomeKit-facing values and Daikin write payloads out. Live cloud testing should stay manual and use `readonly` mode first.
