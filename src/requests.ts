const { schedule_secret, dashboard_url } = process.env;

// Family convention: dashboard_url is schemeless (e.g. localhost:8138); the
// scheme is chosen here. Tolerate a full origin being pasted anyway.
const origin = dashboard_url?.replace(/^https?:\/\//, "");
const baseUrl = origin?.includes("localhost") ? `http://${origin}` : `https://${origin}`;

export async function sendMessage(roomId: string, message: string) {
    const response = await fetch(`${baseUrl}/api/send?roomId=${roomId}&toolId=schedule&secret=${schedule_secret}`, {
        method: "POST",
        body: JSON.stringify({
            message
        }),
        headers: {
            "Content-type": "application/json"
        },
        signal: AbortSignal.timeout(15000)
    });

    if (!response.ok) {
        throw Error(`Hub HTTP ${response.status}; delivery may be uncertain`);
    }

    const result = (await response.json()) as { success?: boolean; message?: string };
    if (result.success !== true) {
        throw Error(String(result.message || "Hub rejected message"));
    }

    return response;
}
