import { randomUUID, createHash } from 'node:crypto';
export function parseCSV(text) {
  const rows = []; let row = [], cell = '', quoted = false;
  text = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') { if (quoted && text[i + 1] === '"') { cell += '"'; i++; } else if (quoted || !cell) quoted = !quoted; else throw Error('Unexpected quote in CSV'); }
    else if (c === ',' && !quoted) { row.push(cell); cell = ''; }
    else if (c === '\n' && !quoted) { row.push(cell.replace(/\r$/, '')); if (row.some(Boolean)) rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (quoted) throw Error('Unclosed CSV quote');
  row.push(cell.replace(/\r$/, '')); if (row.some(Boolean)) rows.push(row);
  const header = rows.shift()?.map(x => x.trim().toLowerCase());
  if (!header?.includes('message') || !header.includes('timestamp')) throw Error('CSV needs message and timestamp columns');
  return rows.map((r, i) => { if (r.length !== header.length) throw Error(`Row ${i + 2}: wrong number of columns`); return { message: r[header.indexOf('message')], timestamp: r[header.indexOf('timestamp')] }; });
}
export function fingerprint(m) { return createHash('sha256').update(JSON.stringify([m.roomId, m.message.trim(), m.at])).digest('hex'); }
export function preview(input, existing = [], now = Date.now()) {
  const { roomId, groupName, timezone, rows } = input;
  if (typeof roomId !== 'string' || !roomId.trim()) throw Error('Enter a destination room ID');
  new Intl.DateTimeFormat('en-GB', { timeZone: timezone }).format();
  if (!Array.isArray(rows) || !rows.length || rows.length > 500) throw Error('Upload between 1 and 500 messages');
  const seen = new Set(existing.filter(m => m.status !== 'cancelled').map(fingerprint));
  return rows.map((r, i) => {
    const issues = [];
    if (typeof r.message !== 'string' || !r.message.trim() || r.message.length > 10000) issues.push('Message must contain 1–10,000 characters');
    // Offset is mandatory: DST gaps and repeated local hours cannot be guessed safely.
    const valid = typeof r.timestamp === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d{1,3})?)?(Z|[+-]\d\d:\d\d)$/.test(r.timestamp) && Number.isFinite(Date.parse(r.timestamp));
    const at = valid ? new Date(r.timestamp).toISOString() : '';
    if (!valid) issues.push('Use an ISO timestamp with Z or an offset, e.g. 2026-10-17T18:00:00+01:00');
    else if (Date.parse(at) <= now) issues.push('Timestamp must be in the future');
    const m = { id: randomUUID(), roomId: roomId.trim(), groupName: String(groupName || roomId), timezone, message: String(r.message || '').trim(), at, status: 'draft', row: i + 2, issues };
    if (valid) { const key = fingerprint(m); if (seen.has(key)) issues.push('Duplicate destination, message and send time'); seen.add(key); }
    return m;
  }).sort((a,b) => a.at.localeCompare(b.at));
}
export async function sendToHub(m, config) {
  const url = new URL('/api/send', config.hubUrl);
  url.search = new URLSearchParams({roomId: m.roomId, toolId: 'message-scheduler', secret: config.secret}).toString();
  const res = await fetch(url, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({message: m.message}), signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw Error(`Hub HTTP ${res.status}; delivery may be uncertain`);
  const result = await res.json();
  if (result.success !== true) throw Error(String(result.message || 'Hub rejected message'));
}
