import { DuckDBConnection, DuckDBInstance } from "@duckdb/node-api";
import path from "node:path";
import { MessageStatus, ScheduledMessage } from "../types";

let connection: DuckDBConnection;
let instance: DuckDBInstance;

export async function startDuckDB() {
    const scheduleDuckDBFileName = "schedule_duckdb.db";

    const dataDir = process.env.DUCKDB_DATA_DIR ?? path.resolve(__dirname, "../..");
    const dbPath = path.join(dataDir, scheduleDuckDBFileName);

    instance = await DuckDBInstance.create(dbPath);
    connection = await instance.connect();

    const tables = [
        {
            name: "Messages",
            creationCommand:
                "CREATE TABLE Messages (id VARCHAR NOT NULL, room_id VARCHAR NOT NULL, group_name VARCHAR NOT NULL, timezone VARCHAR NOT NULL, message VARCHAR NOT NULL, send_at VARCHAR NOT NULL, status VARCHAR NOT NULL, mode VARCHAR NOT NULL, error VARCHAR, created_at VARCHAR, completed_at VARCHAR);",
        }
    ]

    const existingTablesRows = await connection.run("SHOW TABLES;");
    const existingTables = await existingTablesRows.getRowObjects();

    tables.forEach(async (table) => {
        const tableExists = existingTables.filter((existingTable) => existingTable.name === table.name).length > 0;

        if (tableExists) {
            console.log(`${table.name} already exists`);
        } else {
            await connection.run(table.creationCommand);
            console.log(`${table.name} created`);
        }
    });
}

// DuckDB transactions are per connection, so two overlapping writes sharing one
// connection would interleave their BEGIN/COMMIT. Run writes one at a time.
let writeQueue: Promise<unknown> = Promise.resolve();

export function withWriteLock<T>(fn: () => Promise<T>): Promise<T> {
    const next = writeQueue.then(fn, fn);
    writeQueue = next.catch(() => { });
    return next;
}

function rowToMessage(row: Record<string, unknown>): ScheduledMessage {
    return {
        id: row.id as string,
        roomId: row.room_id as string,
        groupName: row.group_name as string,
        timezone: row.timezone as string,
        message: row.message as string,
        at: row.send_at as string,
        status: row.status as MessageStatus,
        mode: row.mode as "demo" | "live",
        error: (row.error as string) ?? undefined,
        createdAt: (row.created_at as string) ?? undefined,
        completedAt: (row.completed_at as string) ?? undefined,
    };
}

export async function getMessagesAll(): Promise<ScheduledMessage[]> {
    const getMessages = `SELECT * FROM Messages;`;
    const prepared = await connection.prepare(getMessages);
    const messagesRows = await prepared.run();
    const messages = await messagesRows.getRowObjects();
    return messages.map(rowToMessage);
}

export async function insertMessage(message: ScheduledMessage) {
    const insert = `INSERT INTO Messages values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11);`;
    await withWriteLock(async () => {
        const prepared = await connection.prepare(insert);
        prepared.bindVarchar(1, message.id);
        prepared.bindVarchar(2, message.roomId);
        prepared.bindVarchar(3, message.groupName);
        prepared.bindVarchar(4, message.timezone);
        prepared.bindVarchar(5, message.message);
        prepared.bindVarchar(6, message.at);
        prepared.bindVarchar(7, message.status);
        prepared.bindVarchar(8, message.mode);
        prepared.bindVarchar(9, message.error ?? "");
        prepared.bindVarchar(10, message.createdAt ?? "");
        prepared.bindVarchar(11, message.completedAt ?? "");
        await prepared.run();
    });
    return;
}

export async function updateMessageStatus(id: string, status: MessageStatus, error = "") {
    const update = `UPDATE Messages SET status = $2, error = $3 WHERE id = $1;`;
    await withWriteLock(async () => {
        const prepared = await connection.prepare(update);
        prepared.bindVarchar(1, id);
        prepared.bindVarchar(2, status);
        prepared.bindVarchar(3, error);
        await prepared.run();
    });
    return;
}

export async function updateMessageContent(id: string, message: string, at: string) {
    const update = `UPDATE Messages SET message = $2, send_at = $3, status = $4, error = $5 WHERE id = $1;`;
    await withWriteLock(async () => {
        const prepared = await connection.prepare(update);
        prepared.bindVarchar(1, id);
        prepared.bindVarchar(2, message);
        prepared.bindVarchar(3, at);
        prepared.bindVarchar(4, "queued");
        prepared.bindVarchar(5, "");
        await prepared.run();
    });
    return;
}

export async function updateMessageCompleted(id: string, status: MessageStatus, error = "") {
    const update = `UPDATE Messages SET status = $2, error = $3, completed_at = $4 WHERE id = $1;`;
    await withWriteLock(async () => {
        const prepared = await connection.prepare(update);
        prepared.bindVarchar(1, id);
        prepared.bindVarchar(2, status);
        prepared.bindVarchar(3, error);
        prepared.bindVarchar(4, new Date().toISOString());
        await prepared.run();
    });
    return;
}

export async function removeMessage(id: string) {
    const deleteMessage = `DELETE FROM Messages WHERE id = $1;`;
    await withWriteLock(async () => {
        const prepared = await connection.prepare(deleteMessage);
        prepared.bindVarchar(1, id);
        await prepared.run();
    });
    return;
}

