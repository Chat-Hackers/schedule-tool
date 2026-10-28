// One-time migration: import a legacy scheduler-data.json queue (from the
// dependency-free scheduler/ implementation) into the DuckDB Messages table.
//
//   node scripts/migrate-json.mjs [path/to/scheduler-data.json]
//
// Reads rows with status queued/accepted/uncertain/failed/cancelled
// and inserts any that are not already present (matched by id).
import { DuckDBInstance } from "@duckdb/node-api";
import fs from "node:fs";

const source = process.argv[2] ?? "scheduler-data.json";
if (!fs.existsSync(source)) {
    console.error(`No such file: ${source}`);
    process.exit(1);
}

const legacy = JSON.parse(fs.readFileSync(source, "utf8"));
const rows = legacy.messages ?? [];
console.log(`${rows.length} legacy messages found in ${source}`);

const dataDir = process.env.DUCKDB_DATA_DIR ?? ".";
const instance = await DuckDBInstance.create(`${dataDir}/schedule_duckdb.db`);
const connection = await instance.connect();

let inserted = 0;
for (const m of rows) {
    const prepared = await connection.prepare("SELECT COUNT(*) FROM Messages WHERE id = $1;");
    prepared.bindVarchar(1, m.id);
    const result = await prepared.run();
    const [{ count }] = await result.getRowObjects();
    if (Number(count) > 0) continue;

    const insert = await connection.prepare(
        "INSERT INTO Messages values ($1, $2, $3, $4, $5, $6, $7, $8, $9);"
    );
    insert.bindVarchar(1, m.id);
    insert.bindVarchar(2, m.roomId);
    insert.bindVarchar(3, m.timezone ?? "Europe/London");
    insert.bindVarchar(4, m.message ?? "");
    insert.bindVarchar(5, m.at ?? "");
    insert.bindVarchar(6, m.status ?? "cancelled");
    insert.bindVarchar(7, m.error ?? "");
    insert.bindVarchar(8, m.createdAt ?? "");
    insert.bindVarchar(9, m.completedAt ?? "");
    await insert.run();
    inserted++;
}

console.log(`Inserted ${inserted} messages into schedule_duckdb.db`);
