# Hosting and Tool Hub integration

The application is ready to run independently. Hosting and live integration are intentionally left for the Hub operator. No external service or real group is connected by default.

## What to deploy

The active implementation is `scheduler/`, a dependency-free Node.js service. The root `src/`, `web/`, `types.ts` and `tsconfig.json` are the inherited events-tool baseline, retained as reference; they are not executed by this app. No frontend build, database server, WhatsApp API account or OpenAI API key is required.

Use one always-on Node.js 22.16+ process with persistent storage. Do not run multiple replicas against the same data file. The scheduler runs on the server, even with the browser closed. It does not run while the host is stopped or asleep. Overdue queued messages run when the service resumes.

## Quick local acceptance check

1. Run `npm test` and `npm start` from the repository root.
2. Open http://localhost:5057. Copy the organiser token from the terminal.
3. Load the demo messages, preview, confirm and enable. Edit one and cancel another. The others become `simulated` at their scheduled times.

## Docker hosting

Copy `.env.example` to `.env`. Set a fixed, long random `ADMIN_TOKEN`, initially keep `SEND_MODE=demo`, then run:

```sh
docker compose up -d --build
docker compose logs scheduler
```

Serve the localhost port through your HTTPS reverse proxy. The Compose named volume persists the queue. Back up that volume; do not delete it when updating. The token grants access to all schedules in this instance. Restrict access to trusted organisers.

The optional generated registration file is beside the queue file in the persistent data volume. After setting PUBLIC_URL and MODULE_SECRET, extract it with:

```sh
docker compose cp scheduler:/data/message-scheduler.json ./message-scheduler.json
```

## Connect the Hub

Set these environment values on the scheduler:

| Variable | Purpose |
| --- | --- |
| `SEND_MODE` | `live` to enable real outbound requests; defaults to demo |
| `HUB_URL` | Tool Hub origin, including https:// |
| `MODULE_SECRET` | Optional explicit shared secret; otherwise generated and persisted in message-scheduler.json |
| `ADMIN_TOKEN` | Separate organiser dashboard access token |
| `PUBLIC_URL` | Public scheduler origin for module registration |
| `DATA_FILE` | Durable writable queue path; Compose sets this to /data/scheduler-data.json |

Restart/recreate the process after environment changes. Register the generated `message-scheduler.json` with the Hub. Its module id is `message-scheduler`; activate that id in the intended bridged group. Use `event_types: []`, since this version schedules outbound messages and does not need incoming chat events. Do not share the registration secret publicly.

The send adapter in `scheduler/core.mjs` calls the existing Hub contract:

```text
POST {HUB_URL}/api/send?roomId={roomId}&toolId=message-scheduler&secret={MODULE_SECRET}
Content-Type: application/json

{"message":"Scheduled message text"}
```

The operator supplies the actual Matrix room ID. A typed group name is a label, not a verified lookup. The server checks HTTP status and the Hub's JSON success flag. Ensure reverse-proxy access logs do not record secret-bearing query strings.

Check one short live message in the intended group, then schedule a small batch. Existing demo entries cannot become live sends merely by changing the mode.

## Known delivery limits

The current Tool Hub responds before awaiting Matrix delivery. Therefore `accepted` means accepted by the Hub, not delivered to WhatsApp. Timeout, network errors or restart during a send result in `uncertain`, with no automatic retry. Verify the group before creating a replacement. Duplicate checks prevent identical destination/text/timestamp combinations, but cannot promise exactly-once delivery across the bridge.

Automated tests cover the local workflow and simulated sends. Real Hub integration, WhatsApp delivery, browser visual QA and the Docker build have not been verified here.

## API for further integration

All `/api/` endpoints require `Authorization: Bearer <ADMIN_TOKEN>`.

| Method | Endpoint | Input |
| --- | --- | --- |
| GET | `/api/state` | Queue records and demo flag |
| POST | `/api/preview` | `{roomId, groupName, timezone, csv}` or `rows: [{message, timestamp}]` instead of csv |
| POST | `/api/queue` | Same payload; revalidates and enables all rows atomically |
| POST | `/api/messages/:id/edit` | `{message, timestamp}`; queued or failed records only |
| POST | `/api/messages/:id/cancel` | `{}`; queued or failed records only |

Timestamps must include an offset or Z. The IANA timezone controls display. Queue files and environment secrets are ignored by Git.

