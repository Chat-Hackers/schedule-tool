import { describe, test, expect, vi, afterEach } from "vitest";
import { parseCSV, preview, fingerprint } from "./schedule";
import { sendMessage } from "./requests";
import { type ScheduledMessage } from "../types";

const input = { roomId: "!test:example.org", groupName: "Test", timezone: "Europe/London", rows: [{ message: "Hello", timestamp: "2099-10-17T18:00:00+01:00" }] };

describe("parseCSV", () => {
    test("supports BOM, commas, quotes and multiline messages", () => {
        expect(parseCSV("\uFEFFtimestamp,message\r\n2099-10-17T18:00:00Z,\"Hello, \"\"team\"\"\nWelcome\"")).toEqual([
            { timestamp: "2099-10-17T18:00:00Z", message: 'Hello, "team"\nWelcome' },
        ]);
        expect(() => parseCSV('message,timestamp\n"unfinished')).toThrow();
    });
});

describe("preview", () => {
    test("timestamps require explicit offsets, reject past and sort chronologically", () => {
        expect(preview(input)[0].at).toBe("2099-10-17T17:00:00.000Z");
        for (const timestamp of ["2099-10-17T18:00", "bad", "2000-01-01T00:00:00Z"]) {
            expect(preview({ ...input, rows: [{ message: "Hi", timestamp }] })[0].issues?.length).toBeTruthy();
        }
        expect(() => preview({ ...input, timezone: "invalid" })).toThrow();
    });

    test("duplicates blocked within upload and across queue; cancelled records permit replacement", () => {
        const first = preview(input)[0];
        expect(preview({ ...input, rows: [...input.rows, ...input.rows] })[1].issues).toContain("Duplicate destination, message and send time");
        expect(preview(input, [{ ...first, status: "accepted" } as ScheduledMessage])[0].issues?.length).toBeTruthy();
        expect(preview(input, [{ ...first, status: "cancelled" } as ScheduledMessage])[0].issues?.length).toBe(0);
    });

    test("fingerprint ignores surrounding whitespace in the message", () => {
        expect(fingerprint({ roomId: "!r", message: " hi ", at: "2026-01-01T00:00:00Z" })).toBe(fingerprint({ roomId: "!r", message: "hi", at: "2026-01-01T00:00:00Z" }));
    });
});

describe("sendMessage hub contract", () => {
    afterEach(() => vi.unstubAllGlobals());

    test("Hub HTTP 200 with success false is a failure", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ success: false, message: "module is not active in this room" }) })));
        await expect(sendMessage("!test:example.org", "Hello")).rejects.toThrow(/not active/);
    });

    test("Hub HTTP error status is a failure", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 502, json: async () => ({}) })));
        await expect(sendMessage("!test:example.org", "Hello")).rejects.toThrow(/Hub HTTP 502/);
    });
});
