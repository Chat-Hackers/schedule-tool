# Message Scheduler

Message Scheduler tool for Chathackers Matrix chat integration tools.

This tool schedules organiser messages to a group chat. Open the dashboard, upload a CSV of timed messages, preview them, then enable the schedule; the server sends each message at its time via the Tool Hub. Built on the same conventions as [events-tool](https://github.com/Chat-Hackers/events-tool): TypeScript, Express, DuckDB, toad-scheduler and a single-file React dashboard.

## Getting started

1. Clone the repo
1. Run the command `npm install`
1. Run the command `npm run dev`
1. Copy the `schedule.json` file and paste into the `registrations` folder of [the wrapper project](https://github.com/chat-hackers/tool-hub)
1. Open http://localhost:5062, enter the organiser token printed in the terminal and queue a test message
1. Marvel in delight at your newfound power

## CSV format

```csv
timestamp,message
2099-10-17T18:00:00+01:00,"Hello, everyone!"
2099-10-17T18:15:00+01:00,The event starts in 15 minutes.
```

Timestamps require an explicit offset or Z. The selected IANA time zone is for display, including daylight-saving changes. Preview blocks past timestamps, missing messages, and identical message/time/destination combinations in the upload or existing queue (except cancelled entries). Maximum 500 messages per import. Review the Matrix room ID against the intended WhatsApp group; the app cannot independently resolve group names.

## Environment

Copy `.env.example` to `.env`:

| Variable | Purpose |
| --- | --- |
| `schedule_secret` | Shared secret the Hub uses to authenticate sends from this tool |
| `dashboard_url` | Tool Hub origin, e.g. `your-hub.example` or `localhost:8138` |
| `ADMIN_TOKEN` | Organiser dashboard access token; long random value when exposed |
| `DEFAULT_ROOM_ID` | Optional pre-filled destination room ID |
| `SEND_MODE` | `live` to enable real sends; anything else is demo |
| `DUCKDB_DATA_DIR` | Directory for `schedule_duckdb.db`; defaults to the repo root |

The dashboard API (`/api/*`) requires the `ADMIN_TOKEN` bearer token. Unlike the other tools, which mutate state only via chat commands proxied by the Hub, this tool accepts "send arbitrary messages to any room" over HTTP and is designed to be tunnelled public — hence the extra auth layer.

## Delivery states

- `queued`: scheduled, not yet sent.
- `simulated`: demo mode only. Nothing sent.
- `accepted`: Hub accepted the request. The Hub does not await Matrix delivery, so this is **not a delivery receipt**.
- `uncertain`: request failed, timed out, or the server restarted during sending. Inspect the destination group before scheduling a replacement. No automatic retry avoids blindly duplicating a possible send.
- `failed`: entry could not run because send mode changed. Edit to review and requeue, or cancel it.
- `cancelled`: will not send. Messages already sending or accepted cannot be edited or recalled.

## Operating notes

- One always-on process per `schedule_duckdb.db`. Do not run replicas against the same database file. The scheduler runs on the server even with the browser closed; overdue queued messages process on the next 1-minute tick after startup.
- Outbound contract: `POST {dashboard_url}/api/send?roomId=...&toolId=schedule&secret=...` with JSON `{ "message": "..." }`. HTTP errors and `success:false` are both treated as failures. Secrets stay server-side.
- Migrating from the old prototype (`scheduler-data.json`)? Run `node scripts/migrate-json.mjs path/to/scheduler-data.json` once against the new database.
- Deploy with `./deploy.sh` (pm2 process name `schedule`).

## Tests

```sh
npm test
```

Tests cover quoted CSV parsing, explicit offsets, past times, duplicates, rejected Hub responses, API access control, preview/queue/edit/cancel, simulated scheduling and durable queue data. Browser rendering and real WhatsApp delivery require separate checks.

Context: [Chat Hackers](https://github.com/Chat-Hackers), [events-tool](https://github.com/Chat-Hackers/events-tool), [tool-hub](https://github.com/Chat-Hackers/tool-hub).
