# Rollback / снимки OS-обвязки

Штатный путь — только **msb-engine**. Архив закрытого Jarvis лежит в
`vendor/legacy-jarvis-os/` и **не** ставится bootstrap’ом.

## Снимок на боксе

При `bootstrap/migrate-from-jarvis.sh` пишется
`/usr/local/lib/msb-engine/rollback/<stamp>/` (бинарь/units/sudoers Jarvis до purge).

Восстановление Jarvis с снимка — аварийный ручной сценарий (не поддерживается как продукт):

```bash
SNAP=/usr/local/lib/msb-engine/rollback/$(cat /usr/local/lib/msb-engine/rollback/LATEST)
# только если осознанно нужен старый helper
cp -a "$SNAP/bin/"* /usr/local/sbin/ 2>/dev/null || true
cp -a "$SNAP/units/"* /etc/systemd/system/ 2>/dev/null || true
systemctl daemon-reload
```

## Откат только бота (без OS)

```bash
# Environment бота / .env
MSB_USE_CLOSED_CORE=1
systemctl restart msb-bot@default
```

Это возвращает `vendor/index.closed.js` для Telegram-ядра; OS-helper остаётся `msb-engine`.
