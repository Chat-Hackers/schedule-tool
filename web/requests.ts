import { type ScheduledMessage } from "../types";

const { origin, pathname } = window.location;
const BASE_URL = `${origin}${pathname}`;

export type StateResponse = {
    messages: ScheduledMessage[];
    demo: boolean;
};

export type ScheduleInput = {
    timezone: string;
    csv?: string;
    rows?: { message: string; timestamp: string }[];
};

async function parse<T>(res: Response): Promise<T> {
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    return data;
}

export async function getState(): Promise<StateResponse> {
    const res = await fetch(`${BASE_URL}/api/state`);
    return parse<StateResponse>(res);
}

// The Hub proxies this tool under its module id, so the room API is reachable
// on the same origin the dashboard is served from.
export async function getRoomName(roomId: string): Promise<string | undefined> {
    const res = await fetch(`${origin}/api/room?roomId=${encodeURIComponent(roomId)}`);
    if (!res.ok) return undefined;
    const room = (await res.json()) as { title?: string };
    return room.title;
}

export async function previewMessages(roomId: string, input: ScheduleInput): Promise<{ messages: ScheduledMessage[] }> {
    const res = await fetch(`${BASE_URL}/api/preview?roomId=${encodeURIComponent(roomId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
    });
    return parse<{ messages: ScheduledMessage[] }>(res);
}

export async function queueMessages(roomId: string, input: ScheduleInput): Promise<{ success: boolean }> {
    const res = await fetch(`${BASE_URL}/api/queue?roomId=${encodeURIComponent(roomId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
    });
    return parse<{ success: boolean }>(res);
}

export async function editMessage(id: string, message: string, timestamp: string): Promise<{ success: boolean }> {
    const res = await fetch(`${BASE_URL}/api/messages/${id}/edit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, timestamp }),
    });
    return parse<{ success: boolean }>(res);
}

export async function cancelMessage(id: string): Promise<{ success: boolean }> {
    const res = await fetch(`${BASE_URL}/api/messages/${id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
    });
    return parse<{ success: boolean }>(res);
}
