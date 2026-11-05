#!/bin/bash
#
# bot-ctl.sh — controlled wrapper for systemctl operations on iia-bot instances.
#
# After multi-bot lands, a VPS may run several systemd template instances
# (iia-bot@default, iia-bot@visual, iia-bot@text, ...). Sudoers does not support
# globs in unit names, so granting the client user broad systemctl access would
# be required to manage them. Instead, this script provides a narrow gate:
# sudoers allows /usr/local/bin/bot-ctl.sh *, and the script itself validates
# both the action verb and the bot-id before calling systemctl.
#
# Usage:
#   bot-ctl.sh <action> [bot-id]
#     action: restart | reload | stop | status | is-active | reset-failed
#     bot-id: optional — defaults to "default". Must match [a-zA-Z0-9_-]{1,32}.
#             Ignored on legacy single-bot VPS (target is always iia-bot).
#
# Examples:
#   bot-ctl.sh restart             # legacy: systemctl restart iia-bot
#                                  # multi-bot: systemctl restart iia-bot@default
#   bot-ctl.sh reload              # light signal (v1: aliases to restart)
#   bot-ctl.sh restart visual      # systemctl restart iia-bot@visual
#   bot-ctl.sh status text         # systemctl status iia-bot@text
#
# Exit codes:
#   0    — systemctl call succeeded
#   64   — bad usage (invalid action or bot-id)
#   *    — passed through from systemctl

set -euo pipefail

ACTION="${1:-}"
BOT_ID="${2:-default}"

# Whitelist of permitted actions. `reload` is the v1 graduated-signal placeholder
# — currently aliased to restart, intended for future hot-reload semantics where
# the bot reloads menu/skill/config files without dropping active sessions.
# Puller-side contract uses `reload` semantically already; bot-track flips the
# alias when it implements SIGHUP-based reload.
case " restart reload stop status is-active reset-failed " in
  *" $ACTION "*) ;;
  *)
    echo "bot-ctl: action must be one of: restart, reload, stop, status, is-active, reset-failed" >&2
    exit 64
    ;;
esac

# Validate bot-id format. Tight enough to forbid shell metachars, dashes, dots,
# slashes — anything that could escape into systemctl's arguments.
if ! [[ "$BOT_ID" =~ ^[a-zA-Z0-9_-]{1,32}$ ]]; then
  echo "bot-ctl: bot-id must match [a-zA-Z0-9_-]{1,32}" >&2
  exit 64
fi

# BEGIN JARVIS LEGACY WRITER PREFLIGHT
legacy_runtime_writer_allowed() {
# Preserve legacy macOS execution; enrollment is supported only on Linux.
case "$(/usr/bin/uname -s)" in Linux) ;; Darwin) return 0 ;; *) return 75 ;; esac
/usr/bin/env -i PATH=/usr/bin:/bin /usr/bin/node --input-type=commonjs - <<'JARVIS_WRITER_PREFLIGHT'
function legacyRuntimeWriterAllowed(io) {
  // Paid enrollment is Linux-only; retain sync's existing macOS/Windows behavior.
  if (!io && process.platform !== 'linux') return true;
  const fs = io || require('node:fs');
  try {
    for (const parent of ['/', '/etc', '/var', '/var/lib']) {
      const s = fs.statSync(parent);
      if (!s.isDirectory() || s.uid !== 0 || (s.mode & 0o022) !== 0) return false;
    }
    for (const marker of ['/etc/jarvis-runtime-enrolled', '/var/lib/jarvis-runtime']) {
      try { fs.lstatSync(marker); return false; }
      catch (e) { if (!e || e.code !== 'ENOENT') return false; }
    }
    return true;
  } catch (_) { return false; }
}
if (!legacyRuntimeWriterAllowed()) { process.stderr.write('JARVIS_RUNTIME_WRITER_HELD\n'); process.exit(75); }
JARVIS_WRITER_PREFLIGHT
}
# END JARVIS LEGACY WRITER PREFLIGHT

case "$ACTION" in
  status|is-active) ;;
  *) legacy_runtime_writer_allowed || exit 75 ;;
esac

# Pick the target unit. On a multi-bot VPS the template file exists; legacy
# single-bot VPS only have iia-bot.service.
if [ -f /etc/systemd/system/iia-bot@.service ]; then
  UNIT="iia-bot@${BOT_ID}"
else
  UNIT="iia-bot"
fi

# v1: reload aliases to restart until bot-track implements true hot-reload.
# This branch will be replaced (or removed) once the bot supports SIGHUP-based
# config/menu reload without process restart.
if [ "$ACTION" = "reload" ]; then
  exec /bin/systemctl restart "$UNIT"
fi

exec /bin/systemctl "$ACTION" "$UNIT"
