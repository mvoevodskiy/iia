#!/usr/bin/env bash
# Проверка установки ядра IIA на этом хосте.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"

FAILS=0
ok()   { printf '  OK  %s\n' "$*"; }
bad()  { printf '  FAIL %s\n' "$*"; FAILS=$((FAILS + 1)); }
info() { printf '  --  %s\n' "$*"; }

echo "=== IIA bootstrap verify ==="

id -u "$CLIENT_USER" >/dev/null 2>&1 && ok "user $CLIENT_USER" || bad "user $CLIENT_USER"
id -u "$ADMIN_USER" >/dev/null 2>&1 && ok "user $ADMIN_USER" || bad "user $ADMIN_USER"

command -v node >/dev/null && ok "node $(node -v)" || bad "node"
[[ -x /usr/bin/node ]] && ok "/usr/bin/node (как в unit)" || bad "/usr/bin/node"

[[ -f "$IIA_HOME/bot/index.js" ]] && ok "bot/index.js" || bad "bot/index.js"
[[ -d "$IIA_HOME/bot/node_modules" ]] && ok "bot/node_modules" || bad "bot/node_modules (npm ci?)"
[[ -f /usr/local/sbin/jarvis-engine ]] && ok "jarvis-engine" || bad "jarvis-engine"
[[ -x /usr/local/bin/bot-ctl.sh ]] && ok "bot-ctl.sh" || bad "bot-ctl.sh"
[[ -x /usr/local/bin/iia-bot-watchdog.sh ]] && ok "watchdog" || bad "watchdog"

[[ -d "$WORKSPACE" ]] && ok "workspace" || bad "workspace"
[[ -d "$PROJECTS" ]] && ok "projects (пусто — норма)" || bad "projects"
[[ -e "$WORKSPACE/ops/pult" ]] && bad "workspace/ops/pult не должен быть на чистой установке" || ok "нет ops/pult"

[[ -f /etc/systemd/system/iia-bot@.service ]] && ok "unit iia-bot@" || bad "unit iia-bot@"
[[ -f /etc/systemd/system/iia-sync.timer ]] && ok "unit iia-sync.timer" || bad "iia-sync.timer"
[[ -f /etc/systemd/system/iia-backup.service ]] && bad "iia-backup не должен ставиться ядром" || ok "нет iia-backup"
[[ -f /etc/systemd/system/iia-oc-install.service ]] && bad "iia-oc-install не должен ставиться ядром" || ok "нет oc-install"

if [[ -f "$IIA_HOME/.env" ]]; then
  ok ".env существует"
  if grep -E '^(PULT_|SOCPUB_|ZAPCITA_|INFOSEC_)[A-Z0-9_]*=' "$IIA_HOME/.env" >/dev/null; then
    bad ".env содержит продуктовые ключи"
  else
    ok ".env без продуктовых ключей"
  fi
  if grep -q '^SYNC_URL=.\+' "$IIA_HOME/.env" && grep -q '^SYNC_KEY=.\+' "$IIA_HOME/.env"; then
    ok "SYNC_URL/SYNC_KEY заданы"
  else
    info "SYNC_URL/SYNC_KEY пусты — puller/sync не заработают"
  fi
  if grep -q '^CLAUDE_CODE_OAUTH_TOKEN=.\+' "$IIA_HOME/.env"; then
    ok "CLAUDE_CODE_OAUTH_TOKEN задан"
  else
    info "CLAUDE_CODE_OAUTH_TOKEN пуст — агент без Claude"
  fi
else
  bad "нет $IIA_HOME/.env"
fi

shopt -s nullglob
bots=( "$IIA_HOME"/bots/*/ )
shopt -u nullglob
if [[ ${#bots[@]} -eq 0 ]]; then
  bad "нет инстансов в $IIA_HOME/bots"
else
  for d in "${bots[@]}"; do
    id="$(basename "$d")"
    findmnt -n "${d}cwd" >/dev/null 2>&1 && ok "bind cwd @$id" || bad "bind cwd @$id"
    [[ -f "${d}.env" ]] || { bad ".env @$id"; continue; }
    if grep -q '^BOT_TOKEN=.\+' "${d}.env"; then
      ok "BOT_TOKEN @$id"
    else
      info "BOT_TOKEN @$id пуст — юнит не должен быть active"
    fi
    if systemctl is-enabled "iia-bot@$id" >/dev/null 2>&1; then
      st="$(systemctl is-active "iia-bot@$id" 2>/dev/null || true)"
      if [[ "$st" == "active" ]]; then
        ok "iia-bot@$id active"
      else
        info "iia-bot@$id enabled, state=$st"
      fi
    else
      info "iia-bot@$id не enabled"
    fi
  done
fi

echo
if [[ "$FAILS" -eq 0 ]]; then
  echo "Итог: всё обязательное на месте ($FAILS fail)."
  exit 0
fi
echo "Итог: $FAILS проблем(ы)."
exit 1
