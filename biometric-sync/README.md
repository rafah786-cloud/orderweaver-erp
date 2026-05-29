# Biometric Sync Service

Local LAN bridge that connects to an Identix / ZKTeco fingerprint device (TCP 4370)
and streams punch events to the ERP in real time.

## Install (one-time, on an office PC)

Requires Node.js 18+.

```bash
cd biometric-sync
npm install
cp .env.example .env
# Edit .env with DEVICE_IP, DEVICE_ID, ERP_URL, DEVICE_API_KEY
npm start
```

To generate `DEVICE_API_KEY`, open the ERP → **Settings → Biometric Devices →
Add Device**. The key is shown once after creation — paste it into `.env`.

## What it does

- Connects to the device on TCP port 4370 (default for Identix/ZKTeco).
- Listens for real-time punch events; falls back to polling every `POLL_INTERVAL_MS`.
- POSTs each punch to `${ERP_URL}/api/public/biometric/punch`.
- If the network is down, punches are queued to `queue.db` and resent automatically.

## Run as a background service (Windows)

Use [nssm](https://nssm.cc/) to register `node index.js` as a Windows Service so it
starts on boot.

## Run as a service (Linux)

```ini
# /etc/systemd/system/biometric-sync.service
[Unit]
After=network-online.target

[Service]
WorkingDirectory=/opt/biometric-sync
ExecStart=/usr/bin/node index.js
Restart=always
EnvironmentFile=/opt/biometric-sync/.env

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now biometric-sync
```
