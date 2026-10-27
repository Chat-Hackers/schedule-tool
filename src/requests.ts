const { schedule_secret, dashboard_url } = process.env;

const baseUrl = dashboard_url?.includes("localhost") ? `http://${dashboard_url}` : `https://${dashboard_url}`;

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
