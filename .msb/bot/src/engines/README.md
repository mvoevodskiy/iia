# Engines

Open-core отвечает через Claude Code (`cc`). OpenClaw (`oc`) — enable/disable через
`msb-engine` (IPC `~/.msb/engine/request` → `/run/msb-engine/state.json`).

Клиент: [`client.mjs`](./client.mjs). Helper: `/usr/local/sbin/msb-engine` (TDR
`docs/tdr/msb-engine-os-replace.md`).

v1 actions: `status`, `enable-jarvis`, `disable-jarvis`, `enable-openclaw`,
`disable-openclaw` (`update-openclaw` → NOT_AVAILABLE до своего канала).
