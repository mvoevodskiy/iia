# Rollback OS-обвязки: msb-engine → jarvis-engine

Снимок перед миграцией: `/usr/local/lib/msb-engine/rollback/<stamp>/`  
Указатель: `/usr/local/lib/msb-engine/rollback/LATEST`

## Быстрый откат (root)

```bash
SNAP=/usr/local/lib/msb-engine/rollback/$(cat /usr/local/lib/msb-engine/rollback/LATEST)

systemctl disable --now msb-engine.path msb-engine-tick.timer
systemctl stop msb-engine.service msb-engine-tick.service 2>/dev/null || true

# вернуть бинарь и units Jarvis
cp -a "$SNAP/bin/jarvis-engine" /usr/local/sbin/jarvis-engine 2>/dev/null \
  || cp -a "$SNAP/bin/jarvis-engine.removed" /usr/local/sbin/jarvis-engine
[[ -d "$SNAP/lib-jarvis-engine" ]] && rsync -a "$SNAP/lib-jarvis-engine/" /usr/local/lib/jarvis-engine/
cp -a "$SNAP/units/"*.path "$SNAP/units/"*.service "$SNAP/units/"*.timer /etc/systemd/system/ 2>/dev/null || true

# sudoers ALL (если был)
[[ -f "$SNAP/jarvis-client.sudoers" ]] && cp -a "$SNAP/jarvis-client.sudoers" /etc/sudoers.d/jarvis-client

systemctl daemon-reload
systemctl unmask jarvis-engine.path jarvis-engine-tick.timer jarvis-engine-update.path
systemctl enable --now jarvis-engine.path jarvis-engine-tick.timer jarvis-engine-update.path

systemctl mask msb-engine.path msb-engine-tick.timer
```

## Откат только бота (без OS)

```bash
# в .env бота / unit Environment
MSB_USE_CLOSED_CORE=1
systemctl restart msb-bot@default
```

Бот снова грузит `vendor/index.closed.js`. OS-helper при этом остаётся `msb-engine`, если не делал полный rollback выше.
