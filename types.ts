export type MatrixEvent = {
    content: {
        body: string;
    },
    sender: string;
    room_id: string;
}

export type MessageStatus =
    | "draft"
    | "queued"
    | "sending"
    | "accepted"
    | "uncertain"
    | "failed"
    | "cancelled";

export type ScheduledMessage = {
    id: string;
    roomId: string;
    timezone: string;
    message: string;
    at: string;
    status: MessageStatus;
    row?: number;
    issues?: string[];
    error?: string;
    createdAt?: string;
    completedAt?: string;
};
