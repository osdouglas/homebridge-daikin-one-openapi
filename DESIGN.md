# Design

This plugin is a thin adapter between the Daikin One Open API and Homebridge/HomeKit.

The code should only need to change when one of those contracts changes: Homebridge, HomeKit, or the Daikin Open API. Device counts, optional fields, zoned versus non-zoned setups, temporarily missing data, and ordinary cloud behavior should be handled by configuration, tolerant parsing, tests, or logging.

## Boundaries

- `platform.ts` owns Homebridge platform lifecycle, discovery, accessory registration, and cache cleanup.
- `thermostatAccessory.ts` owns HomeKit thermostat services and characteristics.
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

Homebridge runs compiled JavaScript from `dist`. Published npm packages include `dist`; the repository does not commit it. Git branch installs are supported by the npm `prepare` script, which builds `dist` after npm clones the branch.

The `prepare` script calls `node scripts/build.mjs` directly. Do not make `prepare` call `npm run build`; some Homebridge installations invoke npm through an explicit Node path and do not put `npm` on the lifecycle script `PATH`.

Do not add a TypeScript runtime or loader to Homebridge. Build before runtime instead.

## Polling And Writes

Regular polling is intentionally conservative. The plugin enforces a minimum poll interval so HomeKit refreshes do not become aggressive Daikin cloud traffic.

Writes are faster than regular polling:

1. HomeKit sends a mode or setpoint change.
2. The plugin sends `PUT /v1/devices/{deviceId}/msp`.
3. A successful HTTP response is treated as the write acknowledgment.
4. The local HomeKit-facing cache is updated immediately from the accepted write payload.
5. A short confirmatory cloud refresh reconciles the local cache with Daikin's actual state.

If the Open API later exposes a stronger write response, event stream, webhook, or push mechanism, use that instead of increasing background polling.

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

## Non-Goals

- Username/password cloud flows.
- Scraping private app APIs.
- Local HVAC protocol support.
- A generic HVAC modeling framework.
- Background polling below the Open API-safe interval just to make external changes appear faster.
