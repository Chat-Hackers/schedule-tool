import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

let serverUp = false;
let child: ChildProcess;
let dir: string;
const { promise: serverExit, resolve: exited } = Promise.withResolvers<void>();

// Stub Tool Hub: accepts the /api/send contract so the scheduler's live
// outbound requests resolve as accepted.
const hub = http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: true }));
});
const hubReady = new Promise<void>((resolve) => hub.listen(8999, "127.0.0.1", resolve));


type ApiResponse = {
    status: number;
    data: { messages?: { id: string; status: string }[]; error?: string; success?: boolean };
};

async function call(route: string, body?: unknown) {
    const res = await fetch("http://127.0.0.1:15057" + route, {
        method: body ? "POST" : "GET",
        headers: { "Content-Type": "application/json" },
        ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: res.status, data: await res.json() } as ApiResponse;
}

beforeAll(async () => {
    await hubReady;
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "schedule-test-"));
    child = spawn(process.execPath, ["dist/src/index.js"], {
        env: { ...process.env, PORT: "15057", DUCKDB_DATA_DIR: dir, schedule_secret: "test-secret", dashboard_url: "localhost:8999" },
        stdio: "pipe",
    });
    child.stderr?.on("data", (chunk) => process.stderr.write(chunk));
    child.once("exit", exited);

    // The server under test owns the clock (toad-scheduler tick); poll its real
    // state endpoint until it accepts connections instead of guessing a delay.
    for (let i = 0; i < 80 && !serverUp; i++) {
        try {
            await call("/api/state");
            serverUp = true;
        } catch {
            await new Promise((resolve) => setTimeout(resolve, 250));
        }
    }
    expect(serverUp).toBe(true);
}, 30000);

afterAll(async () => {
    if (child?.exitCode === null) {
        child.kill();
        await serverExit;
    }
    const hubClosed = new Promise<void>((resolve) => hub.close(() => resolve()));
    await hubClosed;
    fs.rmSync(dir, { recursive: true, force: true });
});

describe("schedule-tool API integration", () => {
    test("API previews, edits, cancels and sends queue via the Hub", async () => {
        const room = encodeURIComponent("!test:example.org");
        const input = {
            timezone: "Europe/London",
            rows: [1, 2, 3].map((n) => ({ message: "Message " + n, timestamp: new Date(Date.now() + 61000).toISOString() })),
        };
        expect((await call(`/api/preview?roomId=${room}`, input)).data.messages?.length).toBe(3);

        expect((await call(`/api/queue?roomId=${room}`, input)).status).toBe(200);
        expect((await call(`/api/queue?roomId=${room}`, input)).status).toBe(400); // duplicates

        let messages = (await call("/api/state")).data.messages ?? [];
        expect(messages.length).toBe(3);

        expect((await call(`/api/messages/${messages[0].id}/edit`, { message: "Edited", timestamp: new Date(Date.now() + 61000).toISOString() })).status).toBe(200);
        expect((await call(`/api/messages/${messages[1].id}/cancel`, {})).status).toBe(200);

        // Real wall-clock wait is unavoidable here: the production scheduler
        // drains `at <= now` on a 1-minute interval against the system clock.
        // Poll the state endpoint for the awaited condition instead of a
        // fixed sleep so the test ends as soon as the queue settles.
        let statuses: string[] = [];
        for (let i = 0; i < 80; i++) {
            await new Promise((resolve) => setTimeout(resolve, 1000));
            messages = (await call("/api/state")).data.messages ?? [];
            statuses = messages.map((m) => m.status).filter((s) => ["accepted", "cancelled"].includes(s));
            if (statuses.length === 3) break;
        }
        expect(statuses.sort()).toEqual(["accepted", "accepted", "cancelled"]);
    }, 120000);
});
