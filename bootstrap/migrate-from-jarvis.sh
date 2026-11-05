#!/usr/bin/env bash
# Миграция живого бокса с jarvis-engine → msb-engine (TDR msb-engine-os-replace).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"

SOURCE="${1:-$REPO_ROOT}"
ROLLBACK_DIR="/usr/local/lib/msb-engine/rollback"
KEEP_JARVIS_BIN=0

usage() {
  cat <<'EOF'
Usage: migrate-from-jarvis.sh [source-dir]

  Останавливает/mask'ит jarvis-engine*, ставит msb-engine, compat /run,
  сохраняет снимок для rollback в /usr/local/lib/msb-engine/rollback/.

  Env:
    KEEP_JARVIS_BIN=1  не удалять /usr/local/sbin/jarvis-engine (только mask units)
EOF
}

[[ "${1:-}" == "-h" || "${1:-}" == "--help" ]] && { usage; exit 0; }
need_root
[[ -d "$SOURCE/usr-local-lib/msb-engine" ]] || die "нет $SOURCE/usr-local-lib/msb-engine"
[[ -f "$SOURCE/usr-local-sbin/msb-engine" ]] || die "нет $SOURCE/usr-local-sbin/msb-engine"

log "миграция jarvis-engine → msb-engine (source=$SOURCE)"

# 1. Snapshot rollback
run mkdir -p "$ROLLBACK_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
SNAP="$ROLLBACK_DIR/$STAMP"
run mkdir -p "$SNAP/units" "$SNAP/bin"
if [[ -f /usr/local/sbin/jarvis-engine ]]; then
  run cp -a /usr/local/sbin/jarvis-engine "$SNAP/bin/" || true
fi
if [[ -d /usr/local/lib/jarvis-engine ]]; then
  run cp -a /usr/local/lib/jarvis-engine "$SNAP/lib-jarvis-engine" || true
fi
for u in jarvis-engine.path jarvis-engine.service \
         jarvis-engine-tick.timer jarvis-engine-tick.service \
         jarvis-engine-update.path jarvis-engine-update.service \
         jarvis-engine-nft.service; do
  [[ -f "/etc/systemd/system/$u" ]] && run cp -a "/etc/systemd/system/$u" "$SNAP/units/" || true
done
echo "$STAMP" >"$ROLLBACK_DIR/LATEST"
log "snapshot → $SNAP"

# 2. Stop jarvis helpers
systemctl stop jarvis-engine.service jarvis-engine-tick.service jarvis-engine-update.service \
  jarvis-engine-nft.service 2>/dev/null || true
systemctl stop jarvis-engine.path jarvis-engine-tick.timer jarvis-engine-update.path 2>/dev/null || true

# 3. Install msb-engine
run install -d -m 0755 /usr/local/sbin /usr/local/lib/msb-engine
run rsync -a --delete \
  --exclude 'rollback/' \
  "$SOURCE/usr-local-lib/msb-engine/" /usr/local/lib/msb-engine/
run install -m 0755 "$SOURCE/usr-local-sbin/msb-engine" /usr/local/sbin/msb-engine
run cp -a /usr/local/sbin/msb-engine /usr/local/lib/msb-engine/msb-engine.good
run chmod 0755 /usr/local/lib/msb-engine/msb-engine.good

for u in msb-engine.path msb-engine.service msb-engine-tick.timer msb-engine-tick.service; do
  run install -m 0644 "$SOURCE/systemd/$u" "/etc/systemd/system/$u"
done

# узкий sudoers
run install -m 0440 "$SOURCE/etc/sudoers.d/msb-engine" /etc/sudoers.d/msb-engine
visudo -cf /etc/sudoers.d/msb-engine || die "visudo msb-engine"

# request dir
run mkdir -p /home/client/.msb/engine
run chown client:client /home/client/.msb/engine
run chmod 700 /home/client/.msb/engine

# 4. Mask jarvis units
for u in jarvis-engine.path jarvis-engine.service \
         jarvis-engine-tick.timer jarvis-engine-tick.service \
         jarvis-engine-update.path jarvis-engine-update.service \
         jarvis-engine-nft.service; do
  systemctl disable --now "$u" 2>/dev/null || true
  systemctl mask "$u" 2>/dev/null || true
done

# vendor base-pulse → SYNC создателя: выключить
systemctl disable --now msb-base-pulse.timer msb-base-pulse.service 2>/dev/null || true
systemctl mask msb-base-pulse.timer msb-base-pulse.service 2>/dev/null || true

# jarvis-client ALL — убрать с чистой миграции (opt-in msb-full-rights)
if [[ -f /etc/sudoers.d/jarvis-client ]]; then
  run mv /etc/sudoers.d/jarvis-client "$SNAP/jarvis-client.sudoers"
  log "jarvis-client sudoers убран → snapshot (вернуть через rollback)"
fi

if [[ "${KEEP_JARVIS_BIN:-0}" != "1" && -f /usr/local/sbin/jarvis-engine ]]; then
  run mv /usr/local/sbin/jarvis-engine "$SNAP/bin/jarvis-engine.removed" || true
fi

# 5. Enable msb-engine
systemctl daemon-reload
/usr/bin/python3 -IS /usr/local/lib/msb-engine/cli.py setup
systemctl enable --now msb-engine.path
systemctl enable --now msb-engine-tick.timer

log "готово. Проверка:"
systemctl is-enabled msb-engine.path || true
systemctl is-enabled jarvis-engine.path 2>/dev/null || echo "jarvis-engine.path masked/absent"
/usr/local/sbin/msb-engine status | head -40 || true
echo
echo "Rollback: docs/runbooks/msb-engine-rollback.md  (snapshot $SNAP)"
