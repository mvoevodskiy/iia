# MSB open-core

Читаемое ядро Constructor Agent в `.msb/bot/src/` (env, `state.json`, Claude CLI
stream-json, overlay `run.mjs`). Закрытый бандл и Jarvis OS-обвязка сняты.

## Запуск

```bash
node .msb/bot/index.js
```

systemd / bootstrap: `ExecStart=…/bot/run.mjs` (или `index.js`).

## Структура

```
.msb/bot/
├── index.js              ← вход → src/main.mjs
├── src/
│   ├── main.mjs
│   ├── config.mjs / paths.mjs / state.mjs / heartbeat.mjs
│   ├── agent/            ← Claude Code stream-json
│   ├── telegram/         ← grammy, меню, ворота ADMIN_ID
│   └── autonomy/         ← задачи + планировщик
├── tests/
└── vendor/
    ├── CONTRACT-*.md     ← снятые контракты подсистем
    ├── snippets/         ← вырезки при переносе
    └── UI-*.md/.tsv      ← эталон UI
```

## Совместимость с обвязкой

`overlay/bot/run.mjs` по-прежнему:

1. ставит PATH-shim `claude`;
2. патчит `Bot` до `import('./index.js')`;
3. читает/пишет `bots/<id>/state.json` и `ext-providers.json`.

Открытое ядро сохраняет поля `authMode`, `hasSubscriptionAuth`, `ccSessionId`,
`model`, `effort`, `permMode`, `engine`, `extAuthBypass`.

## Что уже есть (0.3)

- Telegram UI: hub / агент / настройки / автономка / мониторинг / MCP / …
- **Мониторинг рабочий**: источники, poll, дайджест, `~/.msb/monitor/`
- **Мои боты**: list/add/remove через `sudo bot-ctl.sh` (без хаба создателя)
- **Переменные окружения**: CRUD в `.env` бота + быстрые ключи
- **Обновления**: только свой канал `MSB_OWN_UPDATES_URL` (apply — позже); vendor отключён
- Ход агента Claude CLI, автономка, heartbeat
- **OS-обвязка**: `msb-engine` (IPC `~/.msb/engine/request`, state `/run/msb-engine/state.json`); см. `docs/tdr/msb-engine-os-replace.md`

## Обновления

| Канал | Статус |
|-------|--------|
| Vendor puller/sync создателя | не трогает open-core |
| Свой сервис (`MSB_OWN_UPDATES_URL`) | check есть; apply — когда сервис готов |

## Что дальше

| Подсистема | Статус |
|------------|--------|
| agent-cc глубина (budget/subagents) | дальше |
| OpenClaw | enable/disable через msb-engine; install — v1.1 |
| MCP install | UI есть |
| SSH constructor API | overlay / локальный IP |
| Own updates apply | после сервиса |

Эталон строк UI — в `vendor/UI-SCREENS.md` / `UI-BUTTONS.tsv` и CHANGELOG.md.

## Тесты

```bash
cd .msb/bot && npm test
```

## Политика обновлений

Stock puller создателя на open-core не включаем (ломает смысл ветки), либо
исключаем `bot/**` из манифеста. Канал обвязки `overlay/msb-updates` — свой.
