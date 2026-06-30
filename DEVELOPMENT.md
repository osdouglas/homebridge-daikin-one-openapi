# Development

Use any Node setup you prefer that satisfies the `engines.node` range in `package.json`.

This repo includes `pnpm-lock.yaml`, so CI and examples use pnpm:

```sh
pnpm install
pnpm build
pnpm test
```

Using npm is fine for local development:

```sh
npm install
npm test
```

The unit tests use Node's built-in `node:test` runner. The `test` script builds first, then runs `test/*.test.mjs` against `dist`.

CI runs lint and tests on pull requests and pushes.

## Branch Install

Homebridge runs compiled JavaScript from `dist`. Published npm packages include `dist`; git branch installs use the npm `prepare` script to build after cloning.

For the standard Homebridge Raspberry Pi image, load the Homebridge runtime environment before installing. That puts the bundled `node` and `npm` on `PATH`:

```sh
sudo -u homebridge env HOME=/home/homebridge sh -lc '
  . /opt/homebridge/source.sh
  npm install --prefix /var/lib/homebridge github:osdouglas/homebridge-daikon-plus#codex/branding
'

sudo hb-service restart
```

Configure and test on the Homebridge host that will run the plugin. Start with `readonly: true`, then turn off `logRaw` before write testing.

## Test Shape

Keep unit tests focused on adapter behavior:

- mocked Open API payloads in,
- HomeKit-facing values out,
- Daikin write payloads verified before they leave the client.

Live cloud testing should stay manual and use `readonly` mode first.
