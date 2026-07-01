# 🫜 Daikon Plus

Homebridge platform plugin for Daikin One Open API-compatible thermostats.

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
  "developerMode": true
}
```

Once discovery and state look right, set `developerMode` back to `false`, then set `readonly` to `false` for write testing.

Optional settings:

- `pollIntervalSeconds`: defaults to `180`; lower values are ignored.
- `requestTimeoutSeconds`: defaults to `20`.
- `includeDeviceName`: defaults to `true`.
- `deviceIds`: expose only selected thermostats/zones after discovery.
- `developerMode`: temporary verbose troubleshooting logs, including raw Open API payloads.

## Runtime Behavior

- Each thermostat returned by `GET /v1/devices` is exposed as a HomeKit thermostat.
- If outdoor readings are discovered, the thermostat also gets a separate HomeKit Outdoor Unit accessory with temperature and humidity sensors.
- If circulation fan fields are discovered, the thermostat also gets a separate HomeKit Circulation Fan accessory.
- The thermostat accessory includes a Schedule switch when `scheduleEnabled` is discovered.
- Optional HomeKit accessories and services are sticky once discovered. Transiently missing optional Daikin fields do not remove HomeKit surfaces, but writes that depend on currently missing fields are skipped with a warning.
- HomeKit temperatures are Celsius; Daikin Open API temperatures are treated as Celsius.
- Writes use `PUT /v1/devices/{deviceId}/msp` with `mode`, `heatSetpoint`, and `coolSetpoint`.
- Schedule writes use `PUT /v1/devices/{deviceId}/schedule`.
- Circulation fan writes use `PUT /v1/devices/{deviceId}/fan`; thermostat temperature and mode changes never send fan payloads.
- Background polling is kept to Daikin's documented minimum interval: 180 seconds.
- Successful HomeKit writes update local state immediately, then reconcile with the cloud after Daikin's documented 15-second reflection window.
- HomeKit target modes are limited from Daikin's `modeLimit` before writes are sent to the Open API.
- Emergency heat is displayed as HomeKit heat but is not exposed as a separate HomeKit control.

Set `developerMode` only temporarily. It logs raw API payloads, device IDs, and detailed HVAC state, and is mainly useful when checking how a zoned system appears in the Open API.

The Circulation Fan accessory controls Daikin's fan circulation setting, not the required HVAC blower during active heating or cooling. If Daikin reports fan-state changes after a thermostat write, HomeKit reflects them after the normal cloud refresh.

## Troubleshooting

### Discovery works, but HomeKit shows missing or conservative values

Daikon Plus validates every live thermostat payload before normalizing it for HomeKit. If Daikin omits a required thermostat field, reports a value in an unexpected type, or sends an enum value this plugin does not understand yet, the plugin logs a deduplicated `Daikin payload validation warning` and then uses the same safe fallback path as normal parsing. Unknown additive fields are not warnings; they are logged as developer notes only when `developerMode` is enabled.

This keeps Homebridge running while making Open API drift visible. When reporting an issue, include:

- the validation warning line,
- whether `readonly` is enabled,
- whether this is a zoned system,
- the plugin version,
- and, if you are comfortable sharing it privately with sensitive IDs redacted, a temporary `developerMode` payload.

Turn `developerMode` off again after troubleshooting because it can include detailed HVAC state and device identifiers.

### Optional accessories disappear from Daikin but remain in HomeKit

Outdoor Unit, Circulation Fan, and Schedule surfaces are intentionally sticky once discovered. This avoids room and scene churn in HomeKit when the Open API temporarily omits optional fields. Writes for optional surfaces still fail closed when the current payload does not include the corresponding Daikin field.
