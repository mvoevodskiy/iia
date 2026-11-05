# MSB open-core

Открытая замена закрытого бандла `index.js` (Jarvis / Constructor Agent).

## Зачем

Закрытое ядро — один минифицированный файл ~3 МБ. Его нельзя нормально развивать:
любое изменение обвязки строилось вокруг shim/патчей grammy без доступа внутрь.

Ветка `open-core` держит **читаемое ядро** в `.msb/bot/src/` с тем же внешним
контрактом (env, `state.json`, Claude CLI stream-json, overlay `run.mjs`).

## Запуск

```bash
# штатно (открытое ядро)
node .msb/bot/index.js

# откат к сохранённому бандлу
MSB_USE_CLOSED_CORE=1 node .msb/bot/index.js
```

systemd / bootstrap не меняются: `ExecStart=…/bot/index.js`.

## Структура

```
.msb/bot/
├── index.js              ← переключатель open/closed
├── src/
│   ├── main.mjs
│   ├── config.mjs / paths.mjs / state.mjs / heartbeat.mjs
│   ├── agent/            ← Claude Code stream-json
│   ├── telegram/         ← grammy, меню, ворота ADMIN_ID
│   └── autonomy/         ← задачи + планировщик
├── tests/
└── vendor/
    ├── index.closed.js   ← исходный бандл (эталон поведения)
    ├── deobfuscated.js   ← webcrack (для препарирования)
    └── CONTRACT-*.md     ← снятые контракты подсистем
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
- Ход агента Claude CLI, автономка, heartbeat, откат `MSB_USE_CLOSED_CORE=1`

## Обновления

| Канал | Статус |
|-------|--------|
| Vendor puller/sync создателя | не трогает open-core |
| Свой сервис (`MSB_OWN_UPDATES_URL`) | check есть; apply — когда сервис готов |

## Что дальше

| Подсистема | Статус |
|------------|--------|
| agent-cc глубина (budget/subagents) | дальше |
| OpenClaw | заглушка |
| MCP install | UI есть |
| SSH constructor API | overlay / локальный IP |
| Own updates apply | после сервиса |

Эталон поведения и строки UI — в `vendor/deobfuscated.js` и CHANGELOG.md.

## Тесты

```bash
cd .msb/bot && npm test
```

## Политика обновлений

Puller создателя тянул закрытый `bot/index.js` с их сервера. На open-core
это ломает смысл ветки. Не включай stock puller против этой ветки, либо
исключи `bot/**` из манифеста. Канал обвязки `overlay/msb-updates` — свой.
