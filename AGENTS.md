# Repository conventions

## Product boundaries

- Public defaults use “城市天际线” and neutral assets. Event names, branding and live service addresses belong in private runtime configuration, not source, fixtures, screenshots or commit messages.
- The explicitly approved public GitHub Pages simulation URL may be linked in project documentation. Production and private event service addresses remain private.
- Keep one tower geometry and floor-height definition across gameplay, results and the city. A new personal best replaces the complete tower, never splices rounds together.
- Default play alternates X/Z automatically, one axis per floor, with one-finger input and 60 seconds of active play. Combos provide feedback only. Keep adjustable parameters explicit; do not silently alter scoring.
- Phones show their own best tower; the display reads the shared city. Preserve all valid personal bests, the six-district/76-display-plot model, equal-score display priority by achievement time, and official tied ranks.
- Photos are optional and public when saved. Normal daily reset is 00:00 Asia/Shanghai. Do not add identity recovery, automatic restore or new operational features without a concrete request.

## Privacy and source control

- Git is the source history. Do not duplicate whole source trees as version folders.
- Never commit credentials, real player photos, databases, backups, account/project bindings, customer materials, original prompts/conversations, raw feedback, logs or unreviewed recordings. Keep private evidence outside this checkout.
- Screenshots must be reviewed for visible content, embedded URLs/QR codes and metadata. Clearly label synthetic data and phone-size emulation; never imply they are real participants or physical-device acceptance.
- Before the first commit, inspect every staged and untracked path, the staged diff and binary assets. Before a public push, inspect the exact outgoing commits, messages, files and reachable history, including tags. Stop if sensitive material is found; deleting a working file does not clean history.
- History rewrites, force pushes, visibility changes and new tags require explicit user authorization. Never merge an archived private/customer history into this public baseline automatically.
- Preserve MIT and third-party notices when reusing or distributing code.

## Development and validation

- Read CONTRIBUTING.md for supported local commands. Use isolated data outside the repository; never point tests at production volumes or services.
- Match checks to the change. Record actual commands/results, failed attempts and missing checks privately; keep only reusable, sanitized facts in public documentation.
- Treat unit tests, browser emulation, screenshots, real phones, projection and load tests as separate evidence. Do not claim comprehensive acceptance from a build or a local smoke check.
- Storage identity must be checked before database open, migrations or daily maintenance. Reject mismatched or nonempty unmarked storage. Midnight cleanup must preserve identity markers and infrastructure configuration.
- Shared gateway operations must preserve other paths, sites and declared networks. Use the complete actual Compose file set and the selected service; do not replace a shared root with a single-game template.
- Do not deploy, change hosted access, send messages to other chats or modify cloud data as a side effect of a local source/documentation change. These actions need the user's applicable authorization.
