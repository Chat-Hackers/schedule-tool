import { type ScheduledMessage } from "../types";

const { origin, pathname } = window.location;
const BASE_URL = `${origin}${pathname}`;

const TOKEN_KEY = "schedule-token";

export function getToken(): string {
    return sessionStorage.getItem(TOKEN_KEY) ?? "";
}

export function setToken(token: string) {
    sessionStorage.setItem(TOKEN_KEY, token);
}

export type StateResponse = {
    messages: ScheduledMessage[];
    demo: boolean;
    defaultRoomId: string;
};

function headers(withBody: boolean): HeadersInit {
    return {
        ...(withBody ? { "Content-Type": "application/json" } : {}),
        Authorization: `Bearer ${getToken()}`,
    };
}

async function parse<T>(res: Response): Promise<T> {
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    return data;
}

export async function getState(): Promise<StateResponse> {
    const res = await fetch(`${BASE_URL}/api/state`, { headers: headers(false) });
    return parse<StateResponse>(res);
}

export type ScheduleInput = {
    roomId: string;
    groupName: string;
    timezone: string;
    csv?: string;
    rows?: { message: string; timestamp: string }[];
};

export async function previewMessages(input: ScheduleInput): Promise<{ messages: ScheduledMessage[] }> {
    const res = await fetch(`${BASE_URL}/api/preview`, {
        method: "POST",
        headers: headers(true),
        body: JSON.stringify(input),
    });
    return parse<{ messages: ScheduledMessage[] }>(res);
}

export async function queueMessages(input: ScheduleInput): Promise<{ success: boolean }> {
    const res = await fetch(`${BASE_URL}/api/queue`, {
        method: "POST",
        headers: headers(true),
        body: JSON.stringify(input),
    });
    return parse<{ success: boolean }>(res);
}

export async function editMessage(id: string, message: string, timestamp: string): Promise<{ success: boolean }> {
    const res = await fetch(`${BASE_URL}/api/messages/${id}/edit`, {
        method: "POST",
        headers: headers(true),
        body: JSON.stringify({ message, timestamp }),
    });
    return parse<{ success: boolean }>(res);
}

export async function cancelMessage(id: string): Promise<{ success: boolean }> {
    const res = await fetch(`${BASE_URL}/api/messages/${id}/cancel`, {
        method: "POST",
        headers: headers(true),
        body: JSON.stringify({}),
    });
    return parse<{ success: boolean }>(res);
}
