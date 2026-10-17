# Message Scheduler

A hack-day prototype for the Chat Hackers Matrix → WhatsApp/Signal bridge. Based on Chat-Hackers/events-tool; the new standalone implementation is in `scheduler/`. Original baseline TypeScript files are retained for reference. No npm install or build is needed for the new implementation.

## Run the demo

Requires Node.js 22.16 or newer. From this folder:

```powershell
npm start
```

Startup also prints a small Tool Hub registration JSON and saves it as `message-scheduler.json` beside the queue file. Give that JSON to your friend. A module secret is generated automatically and reused on restart. Set `PUBLIC_URL` in `.env` to your tunnel or hosted URL before registering with a remote Hub. Keep the generated file private and persistent; replacing it changes the secret unless `MODULE_SECRET` is set explicitly.

Open http://localhost:5057 and paste the organiser token printed in the terminal. Click **Load demo messages**, **Preview messages**, confirm the destination and order, then **Enable schedule**. Three messages simulate sending at one-minute intervals. Edit or cancel queued messages. The queue is saved in `scheduler-data.json`, including across restarts. Keep the server running; overdue queued messages process when it restarts.

CSV format (UTF-8; quoted multiline messages supported):

```csv
timestamp,message
2099-10-17T18:00:00+01:00,"Hello, everyone!"
2099-10-17T18:15:00+01:00,The event starts in 15 minutes.
```

Timestamps require an explicit offset or Z. The selected IANA time zone is for display, including daylight-saving changes. Preview blocks past timestamps, missing messages, and identical message/time/destination combinations in the upload or existing queue (except cancelled entries). Maximum 500 messages per import. Review the Matrix room ID against the intended WhatsApp group; the app cannot independently resolve group names.

## Connect your test WhatsApp group

1. Copy `.env.example` to `.env` and set `ADMIN_TOKEN` to a long random value, `MODULE_SECRET` to a separate secret, `HUB_URL` to the Tool Hub origin, and `PUBLIC_URL` to your HTTPS tunnel URL. Set `SEND_MODE=live`. Restart the server. Use one instance per queue file.
2. The server creates `message-scheduler.json`. Give it privately to the Hub operator for registration; it contains the module secret. Do not commit it or paste it into a public document.
3. Have the Hub operator activate `message-scheduler` in the intended bridged test room, and confirm the room ID. The module ID is distinct from `events`.
4. Open your dashboard, enter the organiser token and queue a single test message before importing a larger schedule. Existing demo queue entries cannot turn into live sends when switching modes.

The app defaults to localhost. A tunnel can forward localhost:5057 without changing HOST. Before exposing the app use HTTPS and a fixed ADMIN_TOKEN. Scheduling APIs require that token; it is stored only in browser session storage. The optional authenticated POST / acknowledges events, but no incoming chat subscription is needed for this outbound scheduler; use an empty event_types array in the registration if the Hub sends events without bearer authentication.

The connector uses the verified Hub contract: POST `/api/send?roomId=...&toolId=message-scheduler&secret=...` with JSON `{ "message": "..." }`. HTTP errors and `success:false` are checked. Secrets stay server-side.

## Delivery and prototype limits

- `simulated`: demo only. Nothing sent to WhatsApp.
- `accepted`: Hub accepted the request. Current Hub code does not await Matrix delivery, so this is **not a delivery receipt**.
- `uncertain`: request failed, timed out, or server restarted during sending. Inspect the destination group before scheduling a replacement. No automatic retry avoids blindly duplicating a possible send.
- `failed`: a queued entry could not run because send mode changed. Edit to review and requeue, or cancel it.
- `cancelled`: will not send. Messages already sending or accepted cannot be edited or recalled.

The local file store supports one server process, not concurrent replicas. The server must stay running, and the machine must remain awake. No user accounts, group discovery, attachments or delivery receipts yet. Hub and bridge access are required for actual WhatsApp sends. This version is intended for a small trusted organiser team and a test group, rather than public multi-user hosting.

## Tests

```powershell
npm test
```

Tests cover quoted CSV parsing, explicit offsets, past times, duplicates, rejected Hub responses, API access control, preview/queue/edit/cancel, simulated scheduling and durable queue data. Browser rendering and real WhatsApp delivery require separate checks.

Context: [hack-day architecture document](https://docs.google.com/document/d/1Zl9YJn-svfz8_RqmYhcVJytNOhQzNvR4kVKdZmDBbsA/edit?tab=t.ciuvfctnpcpm), [Chat Hackers](https://github.com/Chat-Hackers), [events-tool](https://github.com/Chat-Hackers/events-tool), [tool-hub](https://github.com/Chat-Hackers/tool-hub).

For your hosting / Tool Hub operator: see [HANDOFF.md](HANDOFF.md) for Docker deployment, environment values, the API contract and live integration steps.

