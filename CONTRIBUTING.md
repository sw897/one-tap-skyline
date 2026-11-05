# Contributing

This repository supports a standalone Node.js application and Docker. It does not require a hosted account or an external database service. The database/blob interfaces have type-only SDK definitions; the running implementation uses local SQLite and files.

## Requirements

- Node.js 22.13 or later and npm.
- Python 3 for the storage/gateway regression checks.
- Docker is optional. A Playwright browser is needed only for the browser smoke check.

## Local practice

```sh
npm ci --ignore-scripts
npm run dev
```

Open `http://127.0.0.1:5173`. The development frontend opens isolated practice mode. Its scores are simulated and stay in browser memory. The full-city preview is `/?mode=display&view=city&demo=full`.

## Shared game on your computer

```sh
npm run build
GAME_ID=skyline PUBLIC_ORIGIN=http://127.0.0.1:8080 SKYLINE_DATA_ROOT=/tmp/skyline-demo SKYLINE_PUBLIC_WRITE_OPEN=1 SKYLINE_PUBLIC_PHOTOS_OPEN=1 npm start
```

PowerShell equivalent after the build:

```powershell
$env:GAME_ID='skyline'
$env:PUBLIC_ORIGIN='http://127.0.0.1:8080'
$env:SKYLINE_DATA_ROOT='D:\private\skyline-demo'
$env:SKYLINE_PUBLIC_WRITE_OPEN='1'
$env:SKYLINE_PUBLIC_PHOTOS_OPEN='1'
npm start
```

Open `/skyline/?mode=display&view=city` on that origin. Participants need the current QR URL, including its daily `entry`; an unqualified mobile URL is rejected. Loopback addresses work only on the computer running the server. Use an origin accessible to the intended devices for shared-device testing.

Use a new empty data directory for a new instance. Existing nonempty storage without its original `.game-id` is intentionally rejected. Do not delete markers to bypass identity checks. Daily reset is based on Asia/Shanghai, not the browser's local timezone.

## Checks

```sh
npm test
npm run build
python -B tests/gateway-deploy.test.py
python -B tests/game-data.test.py
```

For a local visual/input smoke check, keep `npm run dev` running in another terminal:

```sh
npx playwright install chromium
npm run test:browser
```

The browser check only targets loopback hosts. `SKYLINE_BROWSER_CHANNEL=chrome` can select an installed Chrome instead. Set `SKYLINE_EVIDENCE_DIR` to an absolute directory outside this checkout if you want a specific evidence location. Browser-sized phone emulation is not physical-phone acceptance.

## Contributions and reports

Keep changes focused and describe behavior and checks actually performed. Include reproduction steps and synthetic examples, not player photos, credentials, private event names, database exports or live access URLs. Keep raw evidence outside the checkout. Follow [AGENTS.md](AGENTS.md) and the [deployment guide](docs/deployment.md) for changes affecting storage or hosting.

Contributions are provided under the project's [MIT License](LICENSE). Preserve third-party attribution.
