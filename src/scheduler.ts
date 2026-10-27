import { ToadScheduler, SimpleIntervalJob, AsyncTask } from 'toad-scheduler';
import { getMessagesAll, updateMessageStatus, updateMessageCompleted } from './duckdb';
import { sendMessage } from "./requests";

const MINUTES = 1;

export function isDemoMode() {
    return process.env.SEND_MODE !== "live";
}

// A queued entry whose stored mode no longer matches the current send mode
// must not silently become a live send (or vice versa).
async function checkMessages() {
    const demo = isDemoMode();
    const messages = await getMessagesAll();

    const due = messages
        .filter(message => message.status === "queued" && Date.parse(message.at) <= Date.now())
        .sort((a, b) => a.at.localeCompare(b.at));

    for (const message of due) {
        if (message.mode !== (demo ? "demo" : "live")) {
            await updateMessageStatus(message.id, "failed", "Send mode changed; review and reschedule");
            continue;
        }

        await updateMessageStatus(message.id, "sending");

        try {
            if (!demo) {
                await sendMessage(message.roomId, message.message);
            }
            await updateMessageCompleted(message.id, demo ? "simulated" : "accepted");
        } catch (err) {
            const error = err instanceof Error ? err.message : String(err);
            await updateMessageCompleted(message.id, "uncertain", `${error}. No automatic retry; inspect the group before replacing.`);
        }
    }
}

const beginSchedule = () => {
    const scheduler = new ToadScheduler();

    const task = new AsyncTask(
        'process-due-messages',
        async () => {
            await checkMessages();
        },
        (err) => {
            console.error('Scheduled message job failed:', err);
        }
    );

    const job = new SimpleIntervalJob(
        { minutes: MINUTES, runImmediately: true },
        task,
        { preventOverrun: true }
    );

    scheduler.addSimpleIntervalJob(job);

    process.on('SIGTERM', () => scheduler.stop());
    process.on('SIGINT', () => scheduler.stop());
}

export default beginSchedule;
