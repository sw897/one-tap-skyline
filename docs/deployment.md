# Node and Docker deployment

The supported runtime is a standalone Node.js process with SQLite and file-backed photo storage. No project/account binding, connector or cloud database is required. See [CONTRIBUTING.md](../CONTRIBUTING.md) for local practice and build commands.

## Container on a local machine

```sh
docker build -t one-tap-skyline .
docker run --name skyline --read-only --tmpfs /tmp -p 127.0.0.1:8080:8080 -e GAME_ID=skyline -e PUBLIC_ORIGIN=http://127.0.0.1:8080 -e SKYLINE_PUBLIC_WRITE_OPEN=1 -e SKYLINE_PUBLIC_PHOTOS_OPEN=1 -v skyline_db:/data/db -v skyline_photos:/data/photos one-tap-skyline
```

Open `http://127.0.0.1:8080/skyline/?mode=display&view=city`. The public origin must match the scheme, host and port used by clients. This example is loopback-only. For remote devices, configure the intended HTTPS origin and a trusted reverse proxy.

The image runs as a non-root user with a read-only root filesystem. SQLite and photos require separate writable volumes. `/health/live` checks the process; `/health/ready` also reports storage identity, scope, release, day and cleanup-pending status. Do not publish internal health routes through the HTTPS gateway.

## HTTPS and a shared gateway

[compose.yaml](../compose.yaml) is an example for a game and Caddy gateway. Copy [runtime.env.example](../deploy/runtime.env.example) to a private location outside the checkout and replace example values. Explicitly choose independent database/photo volumes, a private gateway directory and an existing externally managed shared network.

For a new shared network, create the chosen network before using Compose. Preserve all existing networks when adding to a gateway that already serves other applications.

The gateway directory is mounted read-only as `/etc/caddy`. Its private `Caddyfile` contains the complete host/site configuration; use [shared-host.example.caddy](../deploy/shared-host.example.caddy) only as a starting point. Each game is imported as a path-only fragment, rendered from [the route template](../deploy/Caddyfile) using its instance ID. Do not overwrite a shared root with one game's fragment.

```sh
docker compose --env-file /private/runtime.env config --quiet
docker compose --env-file /private/runtime.env build
```

Before starting or replacing services, inspect the resolved images, origins, mounts, permissions, ports and all networks. On an existing deployment, pass the same complete Compose file set used by that deployment. Private overrides must also persist every additional service and network. Do not recreate an entire project as a routine game update.

Host HTTP port 80 can be forwarded to Caddy's local HTTP port using the [Nginx example](../deploy/nginx-game.conf.example). Configure DNS, HTTPS access and certificate validation for your own domain without altering unrelated virtual hosts.

## Scope and daily entry

`GAME_ID=skyline` creates `/skyline/`. Each instance has its own route prefix, cookie name/path, preferences and data volumes. Pages, API calls, media URLs and QR targets use that prefix. The old root game routes return 404; `/skyline` redirects to `/skyline/` while preserving the query.

The display is read-only. Mobile opening and round creation require the current daily QR `entry`; score submission reuses the current player's valid round and does not ask for another scan. `v` identifies the current build, not participation eligibility. Separate instances must not share volume names or backend aliases. Path/cookie scoping is not a security boundary between mutually untrusted applications.

Photos are optional and public after saving. Beijing-time midnight resets players, rounds, works, scores, display slots, events, photos/drafts and game rate limits. Configuration, SQL versions, infrastructure markers, certificates and private backups are outside daily cleanup. A late startup compensates for a missed reset; cleanup failures remain pending for retry rather than being reported as physical deletion success.

## Storage identity

Both volume roots are checked before SQLite opens, migrations or daily maintenance. Only empty storage can be initialized. A mismatched marker or a nonempty unmarked volume stops startup without adopting or clearing it. Preserve `.game-id`; it is infrastructure metadata and does not expire at midnight.

Only one game process may write a set of volumes. Do not attach production volumes to candidate smoke tests or use `down -v` to recover from an error. Test with isolated data and keep the original volumes when investigating a failure.

## Controlled updates and recovery

```sh
python3 scripts/gateway.py --file compose.yaml --env-file /private/runtime.env check
```

`admission` blocks new registrations/rounds while allowing current work to finish. After confirming rounds and uploads have drained, `maintenance` blocks only the selected game's path. Replace only that game service, check its identity/readiness, then `open`. Add `--service other_game` when selecting another service from the same actual Compose project.

The helper validates/adapts candidates and compares other routes, including a same-host peer game. It preserves shared files and declared networks. A failed reload restores the previous effective game fragment, including a previous maintenance state. A private known-good checkpoint is saved outside game data. Stopped gateway recovery is explicit with `recover`; missing/mismatched context is rejected. `recreate` operates on the gateway only and requires the complete configuration.

The helper automatically checks mounts and networks, not every image/command/environment difference between current and desired containers. Manually compare those fields before changing them; a successful `check` alone does not prove every future target can be safely recreated.

## Private backup and manual restore

```sh
python3 scripts/game_data.py --file compose.yaml --env-file /private/runtime.env backup --output /private/backups/new-snapshot
python3 scripts/game_data.py --file compose.yaml --env-file /private/runtime.env restore --snapshot /private/backups/new-snapshot --work /private/restores/new-work
```

Use the actual complete Compose file set and optional `--service` selection. The tool drains and pauses only the selected game, freezes SQLite/photos together, validates hashes and database integrity, then reopens the prior gateway phase. Output/work directories must be new, absolute and outside both repository and data volumes.

Restore is manual, for a later game day, and refuses operations close to midnight. It restores city/leaderboard works and eligible saved photos, creates a fresh entry, and does not revive old mobile identities, active rounds or drafts. Default behavior refuses a nonempty target. Explicit `--replace-current` is an operator's overwrite choice and still creates a before-restore snapshot. Failure keeps data safe or retains maintenance for investigation. Normal daily reset remains enabled; no automatic restore is scheduled.

Never publish snapshots, original uploads, credentials or raw operational logs. Review configuration and media before publishing source changes.
