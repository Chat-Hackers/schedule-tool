import { randomUUID, createHash } from "node:crypto";
import { ScheduledMessage } from "../types";

const MAX_MESSAGES = 500;
const MAX_MESSAGE_LENGTH = 10000;

// Offset is mandatory: DST gaps and repeated local hours cannot be guessed safely.
const TIMESTAMP_RE = /^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d{1,3})?)?(Z|[+-]\d\d:\d\d)$/;

export type PreviewRow = {
    message?: unknown;
    timestamp?: unknown;
};

export type PreviewInput = {
    roomId?: unknown;
    timezone?: unknown;
    rows?: PreviewRow[];
};

export function parseCSV(text: string): { message: string; timestamp: string }[] {
    const rows: string[][] = [];
    let row: string[] = [];
    let cell = "";
    let quoted = false;
    text = text.replace(/^\uFEFF/, "");
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (c === '"') {
            if (quoted && text[i + 1] === '"') { cell += '"'; i++; }
            else if (quoted || !cell) quoted = !quoted;
            else throw Error("Unexpected quote in CSV");
        }
        else if (c === "," && !quoted) { row.push(cell); cell = ""; }
        else if (c === "\n" && !quoted) { row.push(cell.replace(/\r$/, "")); if (row.some(Boolean)) rows.push(row); row = []; cell = ""; }
        else cell += c;
    }
    if (quoted) throw Error("Unclosed CSV quote");
    row.push(cell.replace(/\r$/, ""));
    if (row.some(Boolean)) rows.push(row);
    const header = rows.shift()?.map(x => x.trim().toLowerCase());
    if (!header?.includes("message") || !header.includes("timestamp")) throw Error("CSV needs message and timestamp columns");
    return rows.map((r, i) => {
        if (r.length !== header.length) throw Error(`Row ${i + 2}: wrong number of columns`);
        return { message: r[header.indexOf("message")], timestamp: r[header.indexOf("timestamp")] };
    });
}

export function fingerprint(m: { roomId: string; message: string; at: string }): string {
    return createHash("sha256").update(JSON.stringify([m.roomId, m.message.trim(), m.at])).digest("hex");
}

export function preview(input: PreviewInput, existing: ScheduledMessage[] = [], now = Date.now()): ScheduledMessage[] {
    const { roomId, timezone, rows } = input;
    if (typeof roomId !== "string" || !roomId.trim()) throw Error("Enter a destination room ID");
    new Intl.DateTimeFormat("en-GB", { timeZone: timezone as string }).format();
    if (!Array.isArray(rows) || !rows.length || rows.length > MAX_MESSAGES) throw Error("Upload between 1 and 500 messages");
    const seen = new Set(existing.filter(m => m.status !== "cancelled").map(fingerprint));
    return (rows as { message?: unknown; timestamp?: unknown }[]).map((r, i) => {
        const issues: string[] = [];
        if (typeof r.message !== "string" || !r.message.trim() || r.message.length > MAX_MESSAGE_LENGTH) issues.push("Message must contain 1–10,000 characters");
        const valid = typeof r.timestamp === "string" && TIMESTAMP_RE.test(r.timestamp) && Number.isFinite(Date.parse(r.timestamp));
        const at = valid ? new Date(r.timestamp as string).toISOString() : "";
        if (!valid) issues.push("Use an ISO timestamp with Z or an offset, e.g. 2026-10-17T18:00:00+01:00");
        else if (Date.parse(at) <= now) issues.push("Timestamp must be in the future");
        const m: ScheduledMessage = {
            id: randomUUID(),
            roomId: roomId.trim(),
            timezone: timezone as string,
            message: String(r.message || "").trim(),
            at,
            status: "draft",
            mode: "demo",
            row: i + 2,
            issues
        };
        if (valid) { const key = fingerprint(m); if (seen.has(key)) issues.push("Duplicate destination, message and send time"); seen.add(key); }
        return m;
    }).sort((a, b) => a.at.localeCompare(b.at));
}
