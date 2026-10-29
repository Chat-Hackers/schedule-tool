import 'dotenv/config';
import express from "express";
import * as fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { preview, parseCSV } from "./schedule";
import { ScheduledMessage } from "../types";
import { startDuckDB, getMessagesAll, insertMessage, updateMessageStatus, updateMessageContent } from './duckdb';
import beginSchedule from "./scheduler";

const { schedule_secret } = process.env;

const port = Number(process.env.PORT) || 5062;

const toolRegistration = {
  id: "schedule",
  uuid: uuidv4(),
  url: `http://localhost:${port}`,
  emoji: "⏰",
  introduction: "Use the organiser dashboard to upload and schedule messages.",
  title: "Message Scheduler",
  description: "Schedules organiser messages to the group at set times",
  secret: schedule_secret,
  event_types: {}
}

function generateRegistrationFile() {
  fs.writeFileSync(`./${toolRegistration.id}.json`, JSON.stringify(toolRegistration, null, 2));
}


async function start() {

  const app = express();
  await startDuckDB();
  app.use(express.json({ limit: "2mb" }));

  app.get("/", async (req, res) => {
    const htmlPath = path.resolve(__dirname, "../../web/dist/index.html")

    res.sendFile(htmlPath);
  })

  app.post("/", async (req, res) => {
    // This tool sends on a schedule, not in response to chat events.
    // Acknowledge the Hub contract without acting on the event.
    res.send({ success: true, response: {} });
  });

  app.get("/api/state", async (req, res) => {
    const messages = await getMessagesAll();
    res.json({ messages });
  })

  app.post("/api/preview", async (req, res) => {
    try {
      const input = { ...req.body, roomId: req.query.roomId };
      if (input.csv !== undefined) input.rows = parseCSV(input.csv);
      const messages = preview(input, await getMessagesAll());
      res.json({ messages });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  })

  app.post("/api/queue", async (req, res) => {
    try {
      const input = { ...req.body, roomId: req.query.roomId };
      if (input.csv !== undefined) input.rows = parseCSV(input.csv);
      const messages = preview(input, await getMessagesAll());
      if (messages.some(m => m.issues?.length)) return res.status(400).json({ error: "Resolve all preview issues before enabling" });

      for (const message of messages) {
        const queued: ScheduledMessage = { ...message, status: "queued", createdAt: new Date().toISOString() };
        await insertMessage(queued);
      }

      res.json({ success: true });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  })

  app.post("/api/messages/:id/edit", async (req, res) => {
    const messages = await getMessagesAll();
    const message = messages.find(m => m.id === req.params.id);
    if (!message) return res.status(404).json({ error: "Message not found" });
    if (!["queued", "failed"].includes(message.status)) return res.status(400).json({ error: "Only queued or failed messages can be changed" });

    const { message: text, timestamp } = req.body ?? {};
    const [updated] = preview({ roomId: message.roomId, timezone: message.timezone, rows: [{ message: text, timestamp }] }, messages.filter(x => x.id !== message.id));
    if (updated.issues?.length) return res.status(400).json({ error: updated.issues.join("; ") });

    await updateMessageContent(message.id, updated.message, updated.at);

    res.json({ success: true });
  })

  app.post("/api/messages/:id/cancel", async (req, res) => {
    const messages = await getMessagesAll();
    const message = messages.find(m => m.id === req.params.id);
    if (!message) return res.status(404).json({ error: "Message not found" });
    if (!["queued", "failed"].includes(message.status)) return res.status(400).json({ error: "Only queued or failed messages can be changed" });

    await updateMessageStatus(message.id, "cancelled");

    res.json({ success: true });
  })

  app.listen(port);

  // A process restart can leave rows stuck in `sending`; they never completed.
  await recoverSending();
  setTimeout(beginSchedule, 2000);
};

async function recoverSending() {
  const messages = await getMessagesAll();
  for (const message of messages.filter(m => m.status === "sending")) {
    await updateMessageStatus(message.id, "uncertain", "Server restarted during send. Check the group before scheduling a replacement.");
  }
}

generateRegistrationFile();
start();
