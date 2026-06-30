# homebridge-daikin-one-openapi

Homebridge platform plugin for Daikin One+ thermostats using the Daikin One Open API integration-token flow.

The plugin authenticates with `apiKey`, `integratorEmail`, and `integratorToken` against `https://integrator-api.daikinskyport.com`.

## Target Setup

The first target system is a Daikin FIT communicating HVAC system with a DH6V communicating air handler, Daikin One+ Smart Thermostat, and dual-zone configuration managed through the SkyportHome / Daikin One cloud platform.

Each device returned by the Open API is exposed as a HomeKit thermostat accessory. If your zoned system exposes each zone as a separate API device, Homebridge will create a thermostat for each zone. If the Open API returns one parent thermostat with embedded zone data instead, the raw payload can be logged with `logRaw` so zone support can be extended against your actual response shape.

## Configuration

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

## Notes

- HomeKit expects Celsius values for thermostat characteristics. Daikin One Open API temperature values are treated as Celsius.
- Writes use `PUT /v1/devices/{deviceId}/msp` with `mode`, `heatSetpoint`, and `coolSetpoint`.
- Setpoint min, max, and auto-mode heat/cool separation are read from the Open API when present.
- Set `readonly` to `true` while validating a new system if you want HomeKit to display state without sending mode or setpoint changes.
- Set `logRaw` only temporarily. It may log device IDs and detailed HVAC state. This is the first thing to enable if your dual-zone system appears in the Daikin One app but Homebridge only creates one thermostat; the raw response will show whether Daikin exposes zones as separate devices or nested data.

## Development

```sh
pnpm install
pnpm build
```
