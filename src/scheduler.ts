import { ToadScheduler, SimpleIntervalJob, AsyncTask } from 'toad-scheduler';
import { getMessagesAll, updateMessageStatus, updateMessageCompleted } from './duckdb';
import { sendMessage } from "./requests";

const MINUTES = 1;

async function checkMessages() {
    const messages = await getMessagesAll();

    const due = messages
        .filter(message => message.status === "queued" && Date.parse(message.at) <= Date.now())
        .sort((a, b) => a.at.localeCompare(b.at));

    for (const message of due) {
        await updateMessageStatus(message.id, "sending");

        try {
            await sendMessage(message.roomId, message.message);
            await updateMessageCompleted(message.id, "accepted");
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
