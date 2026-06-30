# 🫜 Daikon Plus

Homebridge platform plugin for Daikin One+ thermostats using the official Daikin One Open API.

Daikon Plus is a small Homebridge bridge for Daikin One+. The radish name is deliberate: Daikin One+ -> Daikone Plus -> Daikon Plus. Cute on the outside, boring adapter on the inside.

Official Daikin Open API docs: [Overview](https://www.daikinone.com/openapi/overview/index.html), [Documentation](https://www.daikinone.com/openapi/documentation/index.html), [License Terms](https://www.daikinone.com/openapi/overview/terms/index.html).

Design notes live in [DESIGN.md](DESIGN.md). Development notes live in [DEVELOPMENT.md](DEVELOPMENT.md).

## Credentials

Daikon Plus needs three Daikin Open API values:

- `apiKey`: API key for the integration.
- `integratorEmail`: SkyportHome account email.
- `integratorToken`: Integrator Token linked to that SkyportHome account.

The Integrator Token email alone is not enough. Daikin's current documented flow:

1. The owner installs SkyportHome, creates an account, and adds thermostats.
2. The owner requests the Integrator Token in SkyportHome: `SkyportCare` -> `home integration` -> `get integration token`.
3. The developer enables the SkyportHome developer menu.
4. On iOS: iOS Settings app -> `SkyportHome` -> developer menu.
5. On Android: SkyportHome -> `SkyportCare` -> `home integration`, then tap the page description 5 times.
6. The developer requests the API Key from `SkyportCare` -> `home integration` -> `developer`.

Keep the API Key and Integrator Token secure. Daikin's API Terms say not to forward either credential to a third party.

## Configuration

Configure Daikon Plus on the Homebridge host that will run it. Start read-only while validating discovery and state.

```json
{
  "platform": "DaikonPlus",
  "name": "Daikon Plus",
  "apiKey": "your-daikin-open-api-key",
  "integratorEmail": "email-used-in-the-daikin-one-app@example.com",
  "integratorToken": "your-integrator-token",
  "readonly": true,
  "debug": true,
  "logRaw": true
}
```

Once discovery and state look right, set `logRaw` back to `false`, then set `readonly` to `false` for write testing.

Optional settings:

- `pollIntervalSeconds`: defaults to `180`; lower values are ignored.
- `requestTimeoutSeconds`: defaults to `20`.
- `includeDeviceName`: defaults to `true`.
- `deviceIds`: expose only selected thermostats/zones after discovery.
- `debug`: extra startup/runtime logging.
- `logRaw`: temporary raw Open API payload logging.

## Runtime Behavior

- Each Open API device is exposed as a HomeKit thermostat.
- HomeKit temperatures are Celsius; Daikin Open API temperatures are treated as Celsius.
- Writes use `PUT /v1/devices/{deviceId}/msp` with `mode`, `heatSetpoint`, and `coolSetpoint`.
- Background polling is kept to Daikin's documented minimum interval: 180 seconds.
- Successful HomeKit writes update local state immediately, then reconcile with the cloud after Daikin's documented 15-second reflection window.

Set `logRaw` only temporarily. It may log device IDs and detailed HVAC state, and is mainly useful when checking how a zoned system appears in the Open API.
