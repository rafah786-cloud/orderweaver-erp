# Mattress Maestro Windows Print Bridge

This dependency-free Windows agent pulls committed Sales Order receipt jobs over HTTPS. The ERP itself never tries to reach the factory LAN from a cloud server or browser.

## Print behavior and duplicate protection

- Each slip contains only the customer name, saved item names and quantities; it does not print order numbers, totals or rates.
- The agent checks the configured Windows printer before claiming work. When Windows reports the printer offline or stopped, jobs remain queued.
- A per-PC JSON ledger is atomically saved before print submission. A restart during submission marks the job as needing review rather than automatically sending it a second time.
- A `spooled` status means Windows accepted the print submission. It does not prove that paper physically emerged.
- The ledger is important business state. Do not delete it to fix an error. If unreadable, the agent stops instead of risking duplicate output.
- Tokens are paired through the ERP and stored as hashes in the ERP. The raw token is only returned once and must be kept private.

## Requirements

- Windows 10/11 or Windows Server with Windows PowerShell and the printer's correct Windows driver installed.
- Node.js 20 or later.
- An exact printer name visible in the Windows printer list.
- The compatible ERP endpoints deployed. Pair the printer only after that deployment is live.

## Configure and test interactively first

Set environment variables in the Windows account that will run the agent, substituting the device ID/token from the ERP Print Bridge screen and the exact Windows printer name:

```powershell
$env:ERP_URL = "https://orderweaver-erp.lovable.app"
$env:DEVICE_ID = "00000000-0000-4000-8000-000000000000"
$env:DEVICE_TOKEN = "paste-the-one-time-token-here"
$env:WINDOWS_PRINTER_NAME = "exact name shown in Windows Printers"
```

Then, from this folder run:

```powershell
npm test
npm start
```

Inspect printer wrapping, paper width, queue status and actual output before configuring unattended startup.

## Recovering failures

- **Offline:** restore Wi-Fi/network, paper and Windows driver; the agent does not claim new jobs while Windows reports offline.
- **Failed:** fix the cause, then choose **Retry failed** in the ERP; this creates a new audited job ID.
- **Needs review:** inspect whether paper was produced before choosing **Force reprint after inspection**.
- **Spooled but no paper:** inspect the Windows printer queue and printer itself. The ERP cannot independently prove physical output from a Windows spooler acknowledgement.
- **Exposed token:** deactivate the paired device and create a new token; never post it in chat or logs.

The bridge intentionally uses the installed Windows printer driver. It does not send undocumented ESC/POS bytes to an unknown network endpoint.
