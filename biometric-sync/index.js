import "dotenv/config";
import axios from "axios";
import Database from "better-sqlite3";
import ZKLib from "node-zklib";

const {
  DEVICE_IP,
  DEVICE_PORT = 4370,
  DEVICE_ID,
  ERP_URL,
  DEVICE_API_KEY,
  POLL_INTERVAL_MS = 5000,
} = process.env;

if (!DEVICE_IP || !DEVICE_ID || !ERP_URL || !DEVICE_API_KEY) {
  console.error("Missing env vars. Copy .env.example to .env and fill values.");
  process.exit(1);
}

const ENDPOINT = `${ERP_URL.replace(/\/$/, "")}/api/public/biometric/punch`;

// Local queue (offline buffer)
const db = new Database("queue.db");
db.exec(`CREATE TABLE IF NOT EXISTS queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  payload TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS state (k TEXT PRIMARY KEY, v TEXT);`);

const getState = (k) => db.prepare("SELECT v FROM state WHERE k=?").get(k)?.v;
const setState = (k, v) => db.prepare("INSERT INTO state(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v").run(k, v);

function enqueue(payload) {
  db.prepare("INSERT INTO queue(payload) VALUES(?)").run(JSON.stringify(payload));
}

async function send(payload) {
  await axios.post(ENDPOINT, payload, {
    headers: { "x-device-key": DEVICE_API_KEY, "content-type": "application/json" },
    timeout: 10000,
  });
}

async function flushQueue() {
  const rows = db.prepare("SELECT id, payload FROM queue ORDER BY id LIMIT 100").all();
  for (const row of rows) {
    try {
      await send(JSON.parse(row.payload));
      db.prepare("DELETE FROM queue WHERE id=?").run(row.id);
    } catch (e) {
      console.warn(`[queue] retry later: ${e.message}`);
      return;
    }
  }
}

async function forward(punch) {
  // punch: { user_id (employee code), record_time/timestamp, type }
  // node-zklib returns: { userSn, deviceUserId, recordTime, ip }
  // Identix has no IN/OUT flag — derive by alternating last-known per employee, or use timestamp parity.
  const code = String(punch.deviceUserId ?? punch.userId ?? punch.user_id ?? "").trim();
  if (!code) return;
  const ts = new Date(punch.recordTime ?? punch.timestamp ?? Date.now()).toISOString();

  // Alternate IN/OUT per employee — track last in sqlite
  const last = getState(`last_type:${code}`);
  const punch_type = last === "in" ? "out" : "in";
  setState(`last_type:${code}`, punch_type);

  const payload = { employee_code: code, punch_type, punch_time: ts, device_id: DEVICE_ID };
  try {
    await send(payload);
    console.log(`[ok] ${code} ${punch_type} ${ts}`);
  } catch (e) {
    console.warn(`[offline] queued ${code} ${punch_type}: ${e.message}`);
    enqueue(payload);
  }
}

let zk;

async function connect() {
  zk = new ZKLib(DEVICE_IP, Number(DEVICE_PORT), 10000, 4000);
  await zk.createSocket();
  console.log(`[device] connected ${DEVICE_IP}:${DEVICE_PORT}`);

  // Realtime push
  try {
    await zk.getRealTimeLogs((log) => { forward(log); });
    console.log("[device] realtime listener active");
  } catch (e) {
    console.warn(`[device] realtime not available, polling fallback: ${e.message}`);
  }
}

async function pollOnce() {
  if (!zk) return;
  try {
    const lastTs = getState("last_poll_ts") || "1970-01-01T00:00:00Z";
    const { data } = await zk.getAttendances();
    const fresh = data.filter((r) => new Date(r.recordTime).toISOString() > lastTs);
    fresh.sort((a, b) => new Date(a.recordTime) - new Date(b.recordTime));
    for (const r of fresh) await forward(r);
    if (fresh.length) setState("last_poll_ts", new Date(fresh.at(-1).recordTime).toISOString());
  } catch (e) {
    console.warn(`[poll] ${e.message}`);
    try { await zk.disconnect(); } catch {}
    zk = null;
    setTimeout(connect, 5000);
  }
}

async function main() {
  await connect().catch((e) => {
    console.error(`[device] connect failed: ${e.message} — will retry`);
    setTimeout(main, 5000);
  });

  setInterval(pollOnce, Number(POLL_INTERVAL_MS));
  setInterval(flushQueue, Number(POLL_INTERVAL_MS));
}

main();

process.on("SIGINT", async () => {
  try { await zk?.disconnect(); } catch {}
  process.exit(0);
});
