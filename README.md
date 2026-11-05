# IIA

Платформа Telegram-агента на Linux (systemd). Репозиторий разделён на **ядро** и **обвязку**.

## Два слоя

| Слой | Путь | Запуск | Обязателен? |
|------|------|--------|-------------|
| **Ядро** | `.iia/`, `bootstrap/`, `systemd/`, `usr-local-*` | `node .iia/bot/index.js` | да |
| **Обвязка** | `overlay/` | `node .iia/bot/run.mjs` (после установки) | нет |

Ядро отвечает в Telegram на Claude (штатный бандл). Обвязка добавляет Cursor / Codex / Qwen, LAN SSH и канал обновлений — её можно не ставить.

```
репозиторий
├── .iia/bot/index.js     ← ядро (единственный обязательный вход)
├── bootstrap/            ← установка ядра на сервер
├── systemd/              ← ExecStart → index.js
└── overlay/              ← opt-in
    ├── bot/ext/          ← адаптеры CLI
    ├── bot/run.mjs       ← вход с обвязкой
    ├── install.sh        ← накладывает overlay на ядро
    └── iia-updates/      ← хаб релизов (отдельный сервис)
```

## Установка только ядра

```bash
sudo ./bootstrap/install.sh \
  --source "$PWD" \
  --env-file /root/iia.env \
  --bot-env-file /root/bot-default.env
```

Юнит `iia-bot@default` стартует **`index.js`**. Обвязки на диске нет.

## Установка ядра + обвязка

```bash
sudo ./bootstrap/install.sh ... --with-ext
# или позже:
sudo ./overlay/install.sh --source "$PWD"
```

Drop-in `60-ext-entry.conf` переключает `ExecStart` на `run.mjs`. Удаление drop-in возвращает чистое ядро.

## Политика обновлений

См. [bootstrap/UPDATE-POLICY.md](bootstrap/UPDATE-POLICY.md): код бота можно заменять; workspace и `.env` владельца — нет.

## Что не входит

- Продуктовые проекты и секреты владельца
- Боевой `workspace/`, дневники чатов, skeleton’ы живых ботов
- OpenClaw / R2-backup (отдельные опции платформы)
