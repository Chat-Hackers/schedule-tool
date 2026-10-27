import "./App.css";
import { useEffect, useState } from "react";
import {
    cancelMessage,
    editMessage,
    getState,
    getToken,
    previewMessages,
    queueMessages,
    setToken,
    type ScheduleInput,
    type StateResponse,
} from "./requests";
import { type ScheduledMessage } from "../types";

const TIMEZONES = ["Europe/London", "UTC", "Europe/Paris", "America/New_York", "Asia/Kolkata"];

function formatTime(m: ScheduledMessage): string {
    if (!m.at) return "Invalid timestamp";
    return new Intl.DateTimeFormat("en-GB", { timeZone: m.timezone, dateStyle: "medium", timeStyle: "long" }).format(new Date(m.at));
}

function MessageCard({ message, onEdit, onCancel }: { message: ScheduledMessage; onEdit?: (m: ScheduledMessage) => void; onCancel?: (m: ScheduledMessage) => void }) {
    const editable = ["queued", "failed"].includes(message.status);
    return (
        <article className="message">
            <time>{formatTime(message)}</time>
            {message.status !== "draft" && <span className="status">{message.status}</span>}
            <br />
            <small>{message.groupName} · {message.roomId} · {message.timezone}</small>
            <p>{message.message}</p>
            {[...(message.issues ?? []), ...(message.error ? [message.error] : [])].map((issue, i) => (
                <p key={i} className="error">{issue}</p>
            ))}
            {editable && onEdit && <button className="secondary" onClick={() => onEdit(message)}>Edit</button>}
            {editable && onCancel && <button className="secondary" onClick={() => onCancel(message)}>Cancel</button>}
        </article>
    );
}

export default function App() {
    const [tokenDraft, setTokenDraft] = useState(getToken());
    const [connected, setConnected] = useState(false);
    const [notice, setNotice] = useState("");

    const [groupName, setGroupName] = useState("Hack day · test group");
    const [roomId, setRoomId] = useState("");
    const [timezone, setTimezone] = useState(TIMEZONES[0]);
    const [csv, setCsv] = useState("");

    const [mode, setMode] = useState("Connecting");
    const [previewList, setPreviewList] = useState<ScheduledMessage[]>([]);
    const [previewed, setPreviewed] = useState(false);
    const [confirmed, setConfirmed] = useState(false);
    const [queue, setQueue] = useState<ScheduledMessage[]>([]);

    const [editing, setEditing] = useState<ScheduledMessage | null>(null);
    const [editText, setEditText] = useState("");
    const [editTime, setEditTime] = useState("");
    const [editError, setEditError] = useState("");

    function input(): ScheduleInput {
        return { roomId, groupName, timezone, csv };
    }

    function invalidate() {
        setPreviewed(false);
        setConfirmed(false);
        setPreviewList([]);
    }

    async function refresh() {
        const data: StateResponse = await getState();
        setQueue(data.messages.slice().sort((a, b) => a.at.localeCompare(b.at)));
        setMode(data.demo ? "DEMO · no live sends" : "LIVE · Tool Hub");
        if (!roomId && data.defaultRoomId) setRoomId(data.defaultRoomId);
    }

    async function connect() {
        const token = tokenDraft.trim();
        setToken(token);
        try {
            await refresh();
            setConnected(true);
            setNotice("Connected. Ready to prepare your schedule.");
        } catch (e) {
            setNotice(e instanceof Error ? e.message : String(e));
        }
    }

    async function doPreview() {
        try {
            const data = await previewMessages(input());
            setPreviewList(data.messages);
            const ready = data.messages.every(m => !m.issues?.length);
            setPreviewed(ready);
            setConfirmed(false);
            setNotice(ready ? `${data.messages.length} messages ready for review.` : "Resolve the highlighted issues, then preview again.");
        } catch (e) {
            invalidate();
            setNotice(e instanceof Error ? e.message : String(e));
        }
    }

    async function enable() {
        try {
            await queueMessages(input());
            invalidate();
            setCsv("");
            setNotice("Schedule enabled. Your queue will update as messages are processed.");
            await refresh();
        } catch (e) {
            invalidate();
            setNotice(e instanceof Error ? e.message : String(e));
        }
    }

    async function loadSample() {
        const rows = [
            "Welcome everyone! We’re looking forward to seeing you.",
            "A quick reminder: bring your laptop and your ideas.",
            "Thanks for joining us. Share what you built!",
        ];
        setCsv("timestamp,message\n" + rows.map((m, i) => `${new Date(Date.now() + (i + 1) * 60000).toISOString()},"${m}"`).join("\n"));
        if (!roomId) setRoomId("!demo-test-group:matrix.campaignlab.uk");
        invalidate();
    }

    async function loadFile(files: FileList | null) {
        try {
            const file = files?.[0];
            if (!file) return;
            if (file.size > 1e6) throw new Error("Please choose a CSV under 1 MB");
            setCsv(await file.text());
            invalidate();
        } catch (e) {
            setNotice(e instanceof Error ? e.message : String(e));
        }
    }

    async function doCancel(m: ScheduledMessage) {
        try {
            await cancelMessage(m.id);
            await refresh();
        } catch (e) {
            setNotice(e instanceof Error ? e.message : String(e));
        }
    }

    function openEdit(m: ScheduledMessage) {
        setEditing(m);
        setEditText(m.message);
        setEditTime(m.at);
        setEditError("");
    }

    async function saveEdit(e: React.FormEvent) {
        e.preventDefault();
        if (!editing) return;
        try {
            await editMessage(editing.id, editText, editTime);
            setEditing(null);
            await refresh();
        } catch (e) {
            setEditError(e instanceof Error ? e.message : String(e));
        }
    }

    useEffect(() => {
        if (getToken()) {
            refresh().catch((e) => setNotice(e instanceof Error ? e.message : String(e)));
            const interval = setInterval(() => {
                refresh().catch((e) => setNotice(e instanceof Error ? e.message : String(e)));
            }, 5000);
            return () => clearInterval(interval);
        }
    }, []);

    return (
        <>
            <header>
                <a href="/" className="brand">◷ <span>CHAT HACKERS<small>Organiser tools</small></span></a>
                <span className="badge">{mode}</span>
            </header>
            <main>
                <div className="intro">
                    <p className="eyebrow">A LITTLE PLANNING. BETTER CONVERSATIONS.</p>
                    <h1>Right message.<br />Right moment.</h1>
                    <p>Prepare your messages now. Give your group a quieter evening.</p>
                </div>
                <div className="access">
                    <label>Organiser access token
                        <input type="password" autoComplete="off" placeholder="Copy from your server terminal"
                            value={tokenDraft} onChange={(e) => setTokenDraft(e.target.value)} />
                    </label>
                    <button onClick={connect}>Connect</button>
                </div>
                <p id="notice" role="status" aria-live="polite">{notice}</p>
                <div className="layout">
                    <section className="panel">
                        <div className="section-title">
                            <span className="step">01</span>
                            <div>
                                <h2>Prepare your schedule</h2>
                                <p>One group, one time zone, a few well-timed messages.</p>
                            </div>
                        </div>
                        <label>Group name
                            <input value={groupName} onChange={(e) => { setGroupName(e.target.value); invalidate(); }} />
                        </label>
                        <label>Destination Matrix room ID
                            <input placeholder="!your-test-room:matrix.campaignlab.uk"
                                value={roomId} onChange={(e) => { setRoomId(e.target.value); invalidate(); }} />
                        </label>
                        <p className="hint">Use the bridged room ID from the Chat Hackers dashboard. Check that it belongs to your intended WhatsApp group.</p>
                        <label>Preview time zone
                            <select value={timezone} onChange={(e) => { setTimezone(e.target.value); invalidate(); }}>
                                {TIMEZONES.map(tz => <option key={tz}>{tz}</option>)}
                            </select>
                        </label>
                        <div className="upload">
                            <strong>Bring your messages</strong>
                            <p>Upload a CSV, or paste it below.</p>
                            <input type="file" accept=".csv,text/csv" aria-label="Upload messages CSV"
                                onChange={(e) => loadFile(e.target.files)} />
                            <button className="secondary" onClick={loadSample}>Load demo messages</button>
                        </div>
                        <label>CSV contents
                            <textarea rows={8} placeholder={"timestamp,message\n2026-10-17T18:00:00+01:00,Welcome everyone!"}
                                value={csv} onChange={(e) => { setCsv(e.target.value); invalidate(); }} />
                        </label>
                        <p className="hint">Columns: timestamp,message. Include an explicit UTC offset or Z in every timestamp. The time zone above controls the preview; it does not reinterpret your CSV.</p>
                        <button onClick={doPreview}>Preview messages →</button>
                    </section>
                    <section className="panel">
                        <div className="section-title">
                            <span className="step">02</span>
                            <div>
                                <h2>Check before you send</h2>
                                <p>Review destination, local times and message order.</p>
                            </div>
                        </div>
                        {previewList.length === 0 ? (
                            <div className="empty">Your messages will appear here.<br /><small>Upload a CSV to put your plan in order.</small></div>
                        ) : (
                            previewList.map(m => <MessageCard key={m.id} message={m} />)
                        )}
                        <label className="check">
                            <input type="checkbox" checked={confirmed} disabled={!previewed}
                                onChange={(e) => setConfirmed(e.target.checked)} />
                            I checked the destination group, time zone and message order.
                        </label>
                        <button disabled={!previewed || !confirmed} onClick={enable}>Enable schedule</button>
                        <p className="hint">Demo mode simulates sends. Live mode submits messages to the Hub. Keep the server running for scheduled messages to process.</p>
                    </section>
                </div>
                <section className="panel queue">
                    <div className="section-title">
                        <span className="step">03</span>
                        <div>
                            <h2>Your message queue</h2>
                            <p>Follow progress, edit a message or cancel a send.</p>
                        </div>
                        <button className="secondary" onClick={() => refresh().catch((e) => setNotice(e instanceof Error ? e.message : String(e)))}>Refresh</button>
                    </div>
                    {!connected ? (
                        <div className="empty">Connect to see your queue.</div>
                    ) : queue.length === 0 ? (
                        <div className="empty">A clear queue. Your next plan starts above.</div>
                    ) : (
                        queue.map(m => <MessageCard key={m.id} message={m} onEdit={openEdit} onCancel={doCancel} />)
                    )}
                    <p className="hint">Accepted = the Hub accepted the request, not confirmed WhatsApp delivery. Uncertain sends are never retried automatically. Check the group before scheduling a replacement.</p>
                </section>
                <footer>CHAT HACKERS / CAMPAIGN LAB <span>Built for thoughtful organising.</span></footer>
            </main>
            {editing && (
                <dialog open>
                    <form onSubmit={saveEdit}>
                        <h2>Edit message</h2>
                        <label>Message
                            <textarea required rows={5} value={editText} onChange={(e) => setEditText(e.target.value)} />
                        </label>
                        <label>ISO timestamp with UTC offset
                            <input required value={editTime} onChange={(e) => setEditTime(e.target.value)} />
                        </label>
                        <p role="alert" className="error">{editError}</p>
                        <button type="submit">Save changes</button>
                        <button type="button" className="secondary" onClick={() => setEditing(null)}>Close</button>
                    </form>
                </dialog>
            )}
        </>
    );
}
