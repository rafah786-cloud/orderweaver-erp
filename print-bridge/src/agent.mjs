import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { homedir } from "node:os";
import { formatReceipt } from "./format-receipt.mjs";

const execFile = promisify(execFileCallback);
const ERP_URL = String(process.env.ERP_URL ?? "").replace(/\/+$/, "");
const DEVICE_ID = process.env.DEVICE_ID ?? "";
const DEVICE_TOKEN = process.env.DEVICE_TOKEN ?? "";
const PRINTER_NAME = process.env.WINDOWS_PRINTER_NAME ?? "";
const POLL_INTERVAL_MS = Math.max(2000, Math.min(Number(process.env.POLL_INTERVAL_MS ?? 5000), 60000));
const LEDGER_PATH = process.env.PRINT_BRIDGE_LEDGER ?? join(homedir(), ".mattress-maestro", "print-ledger.json");
const POWERSHELL = process.env.POWERSHELL_EXE ?? "powershell.exe";

function validateConfig() {
  if (!ERP_URL || !/^https:\/\//i.test(ERP_URL)) throw new Error("ERP_URL must be an HTTPS URL");
  if (!/^[0-9a-f-]{36}$/i.test(DEVICE_ID)) throw new Error("DEVICE_ID must be the paired device UUID");
  if (!/^[0-9a-f]{64}$/i.test(DEVICE_TOKEN)) throw new Error("DEVICE_TOKEN must be the one-time pairing token");
  if (!PRINTER_NAME.trim()) throw new Error("WINDOWS_PRINTER_NAME is required");
}

let ledger = {};

async function loadLedger() {
  try {
    const parsed = JSON.parse(await readFile(LEDGER_PATH, "utf8"));
    ledger = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw new Error("Print ledger is unreadable. Stop to avoid duplicate output: " + error.message);
    }
    ledger = {};
  }
}

async function persistLedger() {
  await mkdir(dirname(LEDGER_PATH), { recursive: true });
  const temporary = LEDGER_PATH + ".tmp";
  await writeFile(temporary, JSON.stringify(ledger, null, 2), { encoding: "utf8", mode: 0o600 });
  await rename(temporary, LEDGER_PATH);
}

function psB64(text) {
  return Buffer.from(String(text), "utf8").toString("base64");
}

async function runPowerShell(script) {
  return execFile(POWERSHELL, [
    "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script,
  ], { windowsHide: true, timeout: 20000, maxBuffer: 1024 * 1024, encoding: "utf8" });
}

async function assertPrinterReady() {
  const printer = psB64(PRINTER_NAME);
  const script = [
    "$ErrorActionPreference = 'Stop'",
    "$n = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('" + printer + "'))",
    "$p = Get-CimInstance Win32_Printer | Where-Object { $_.Name -eq $n } | Select-Object -First 1",
    "if (-not $p) { [Console]::Error.WriteLine('Configured Windows printer was not found'); exit 3 }",
    "if ($p.WorkOffline -or $p.PrinterStatus -eq 7 -or $p.PrinterStatus -eq 6) { [Console]::Error.WriteLine('Windows reports the printer offline or stopped'); exit 22 }",
    "Write-Output 'READY'",
  ].join("; ");
  await runPowerShell(script);
}

async function sendRequest(path, body) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(ERP_URL + path, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer " + DEVICE_TOKEN,
      },
      body: JSON.stringify({ device_id: DEVICE_ID, ...body }),
      signal: controller.signal,
    });
    const text = await response.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch { /* endpoint errors are shown by status only */ }
    if (!response.ok) throw new Error("ERP endpoint returned HTTP " + response.status);
    return data;
  } finally {
    clearTimeout(timeout);
  }
}

async function acknowledge(jobId, outcome, message) {
  return sendRequest("/api/print-bridge/ack", {
    job_id: jobId,
    outcome,
    message: String(message ?? "").slice(0, 1000),
  });
}

async function printText(text) {
  const printer = psB64(PRINTER_NAME);
  const receipt = psB64(text);
  const script = [
    "$ErrorActionPreference = 'Stop'",
    "$n = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('" + printer + "'))",
    "$content = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('" + receipt + "'))",
    "$p = Get-CimInstance Win32_Printer | Where-Object { $_.Name -eq $n } | Select-Object -First 1",
    "if (-not $p) { throw 'Configured Windows printer was not found' }",
    "if ($p.WorkOffline -or $p.PrinterStatus -eq 7 -or $p.PrinterStatus -eq 6) { throw 'Windows reports the printer offline or stopped' }",
    "$content | Out-Printer -Name $n -ErrorAction Stop",
  ].join("; ");
  await runPowerShell(script);
}

async function reconcileInterruptedJobs() {
  for (const [jobId, record] of Object.entries(ledger)) {
    if (record?.state === "submitting") {
      // The OS may have accepted output immediately before the process crashed.
      // Never auto-send that job again; require operator inspection first.
      ledger[jobId] = {
        state: "needs_review",
        updatedAt: new Date().toISOString(),
        lastError: "Agent restarted while print submission was in progress; check for physical output before reprinting.",
      };
      await persistLedger();
    }
    if (ledger[jobId]?.state === "spooled") {
      try { await acknowledge(jobId, "spooled", "Previously submitted to the Windows print spooler; duplicate suppressed by local ledger."); }
      catch { /* retry on next start/cycle; never print again for this ID */ }
    } else if (ledger[jobId]?.state === "failed") {
      try { await acknowledge(jobId, "failed", ledger[jobId].lastError ?? "Windows spool submission failed."); }
      catch { /* retry the acknowledgement later */ }
    } else if (ledger[jobId]?.state === "needs_review") {
      try { await acknowledge(jobId, "needs_review", ledger[jobId].lastError); }
      catch { /* retry the acknowledgement later */ }
    }
  }
}

async function processOneJob() {
  // Do not claim work when the printer is offline; jobs remain safely queued.
  await assertPrinterReady();
  const response = await sendRequest("/api/print-bridge/poll", {});
  const job = response?.job;
  if (!job) return false;
  if (!job.id || !job.payload) throw new Error("ERP returned an invalid print job");

  const previous = ledger[job.id];
  if (previous?.state === "spooled") {
    await acknowledge(job.id, "spooled", "Duplicate suppressed by the local print ledger.");
    return true;
  }
  if (previous?.state === "submitting" || previous?.state === "needs_review") {
    ledger[job.id] = {
      state: "needs_review",
      updatedAt: new Date().toISOString(),
      lastError: previous?.lastError ?? "Previous submission state is uncertain; inspect printer before reprint.",
    };
    await persistLedger();
    await acknowledge(job.id, "needs_review", ledger[job.id].lastError);
    return true;
  }

  let receipt;
  try {
    receipt = formatReceipt(job.payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Receipt data is invalid";
    ledger[job.id] = { state: "failed", updatedAt: new Date().toISOString(), lastError: message };
    await persistLedger();
    await acknowledge(job.id, "failed", message);
    return true;
  }

  // Durable pre-submit record: a crash between this write and acknowledgement is
  // deliberately treated as uncertain, never as an automatic print retry.
  ledger[job.id] = { state: "submitting", updatedAt: new Date().toISOString() };
  await persistLedger();
  try {
    await printText(receipt);
    ledger[job.id] = { state: "spooled", updatedAt: new Date().toISOString() };
    await persistLedger();
    try {
      await acknowledge(job.id, "spooled", "Submitted to the configured Windows print spooler.");
    } catch (error) {
      console.error("Could not acknowledge spooled job; local ledger will suppress duplicate output:", error.message);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Windows print spooler submission failed";
    ledger[job.id] = { state: "failed", updatedAt: new Date().toISOString(), lastError: message };
    await persistLedger();
    await acknowledge(job.id, "failed", message);
  }
  return true;
}

async function main() {
  validateConfig();
  await loadLedger();
  await reconcileInterruptedJobs();
  console.log("Mattress Maestro Print Bridge started. Target printer:", PRINTER_NAME);
  let stopped = false;
  const stop = () => { stopped = true; };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  while (!stopped) {
    try {
      const hadJob = await processOneJob();
      if (!hadJob) await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    } catch (error) {
      console.error("Print Bridge is waiting; the ERP or printer may be unavailable:", error.message);
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error("Print Bridge stopped:", error.message);
    process.exitCode = 1;
  });
}
