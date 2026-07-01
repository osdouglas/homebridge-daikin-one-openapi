# Design

Daikon Plus is a thin adapter between the Daikin One Open API and Homebridge/HomeKit.

The code should only need to change when one of those contracts changes: Homebridge, HomeKit, or the Daikin Open API. Device counts, optional fields, zoned versus non-zoned setups, temporarily missing data, and ordinary cloud behavior should be handled by configuration, tolerant parsing, tests, or logging.

## Boundaries

- `platform.ts` owns Homebridge platform lifecycle, discovery, accessory registration, and cache cleanup.
- `thermostatAccessory.ts` owns HomeKit thermostat services and characteristics.
- `outdoorUnitAccessory.ts` owns HomeKit outdoor temperature and humidity sensor services.
- `circulationFanAccessory.ts` owns HomeKit circulation fan services and characteristics.
- `daikinOpenApiClient.ts` owns Daikin authentication, device discovery, polling, writes, local cache updates, and listener notification.
- `daikinOpenApiMapper.ts` owns conversion from raw Open API payloads to thermostat data.
- `setpointPolicy.ts` owns setpoint clamping and auto-mode heat/cool separation.
- `config.ts` owns Homebridge config validation and defaults.
- `httpClient.ts` owns JSON HTTP requests, status handling, and timeouts.
- `types.ts` owns shared data contracts.

Keep these boundaries narrow. If a change crosses several files, it should be because the external contract changed across those responsibilities, not because internal code is reaching across layers.

## Style

- Prefer small functions and narrow interfaces.
- Do not add broad framework abstractions around Homebridge or the Daikin API.
- Keep the Daikin API recognizable in the code. This project should not grow a second HVAC domain model.
- Parse unknown or missing Open API fields defensively.
- Avoid crashing Homebridge for recoverable cloud or payload issues.
- Use dependency injection where it buys testability, especially around HTTP.
- Do not introduce inheritance unless Homebridge requires it.

SOLID matters here as a constraint on drift, not as ceremony. The goal is code that is easy to keep current when the external contracts move.

## Language And Packaging

The source is TypeScript because Homebridge and HAP expose useful types for platform plugins, services, characteristics, and config objects. Those types catch adapter mistakes while keeping the runtime simple.

Homebridge runs compiled JavaScript from `dist`. Published npm packages include `dist`; the repository does not commit it. Git branch installs are supported by the npm `prepare` script, which runs the normal build after npm clones the branch.

For local testing on the official Homebridge Raspberry Pi image, install from inside the Homebridge environment so `/opt/homebridge/bin` is on `PATH`. Do not add package-level workarounds for a shell that has not loaded Homebridge's runtime environment.

Do not add a TypeScript runtime or loader to Homebridge. Build before runtime instead.

## Polling And Writes

Regular polling is intentionally conservative. The plugin enforces a minimum poll interval so HomeKit refreshes do not become aggressive Daikin cloud traffic.

Writes are faster than regular polling:

1. HomeKit sends a mode or setpoint change.
2. The plugin validates the mode against Daikin's reported mode limits.
3. The plugin sends `PUT /v1/devices/{deviceId}/msp`.
4. A successful HTTP response is treated as the write acknowledgment.
5. The local HomeKit-facing cache is updated immediately from the accepted write payload.
6. A short confirmatory cloud refresh reconciles the local cache with Daikin's actual state.

Schedule and circulation fan controls are separate Daikin write paths:

- Schedule writes use `PUT /v1/devices/{deviceId}/schedule`.
- Circulation fan writes use `PUT /v1/devices/{deviceId}/fan`.
- Thermostat mode and setpoint changes must not send fan or schedule payloads.

Emergency heat is deliberately conservative. If Daikin reports emergency heat as the current mode, HomeKit displays heat and setpoint writes preserve the Daikin mode value. HomeKit does not expose a separate emergency heat control.

If the Open API later exposes a stronger write response, event stream, webhook, or push mechanism, use that instead of increasing background polling.

## Authentication

Support one golden path: Daikin One Open API integration credentials as documented by Daikin. The required inputs are the API key, the SkyportHome account email, and the integrator token.

The API key is sent as `x-api-key`. The access token from `POST /v1/token` is sent as `Authorization: Bearer ...` on all later requests.

Do not add fallback authentication modes or alternate header behavior based on third-party code. If Daikin changes the official Open API authentication contract, update this path and its tests.

## Testing

Unit tests should stay at the adapter boundary:

- mocked Open API payloads in,
- normalized thermostat values out,
- HomeKit-facing behavior verified through public methods,
- Daikin write payloads verified before they leave the client.

Live cloud tests should remain manual. Use a separate Homebridge instance or child bridge, start with `readonly: true`, and enable `logRaw` only long enough to inspect real payload shape.

## Known Limits

Dual-zone support depends on how the Daikin Open API represents the system.

If each zone appears as a separate device, each zone becomes a HomeKit thermostat. If zones are nested inside a parent thermostat payload, support should be added against the real logged payload shape without changing the broader architecture.

The public Open API does not expose physical outdoor-unit identity. When outdoor readings are present, each thermostat device gets its own Outdoor Unit accessory rather than trying to infer shared topology.

The Circulation Fan accessory controls Daikin's circulation setting. It should not be presented as a guarantee that HomeKit can stop the blower required for active heating or cooling.

## Non-Goals

- Username/password cloud flows.
- Scraping private app APIs.
- Local HVAC protocol support.
- A generic HVAC modeling framework.
- Background polling below the Open API-safe interval just to make external changes appear faster.
