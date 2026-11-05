# IIA open-core

Открытая замена закрытого бандла `index.js` (Jarvis / Constructor Agent).

## Зачем

Закрытое ядро — один минифицированный файл ~3 МБ. Его нельзя нормально развивать:
любое изменение обвязки строилось вокруг shim/патчей grammy без доступа внутрь.

Ветка `open-core` держит **читаемое ядро** в `.iia/bot/src/` с тем же внешним
контрактом (env, `state.json`, Claude CLI stream-json, overlay `run.mjs`).

## Запуск

```bash
# штатно (открытое ядро)
node .iia/bot/index.js

# откат к сохранённому бандлу
IIA_USE_CLOSED_CORE=1 node .iia/bot/index.js
```

systemd / bootstrap не меняются: `ExecStart=…/bot/index.js`.

## Структура

```
.iia/bot/
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

## Что уже есть (0.2)

- Telegram UI **с точки зрения меню**: hub, агент, настройки, автономка, мониторинг, MCP, навыки, сессии, проекты, setup — те же кнопки/`callback_data`, что в бандле
- Slash-команды как в `sBA` (+ help-тексты)
- ADMIN_ID: чужие апдейты — тишина; Setup Mode как в контракте
- Приём Claude OAuth / API key
- Ход агента через `claude -p --output-format stream-json`
- Сессии (`ccSessionId`), статус tool_use в чате
- Автономка: парсер «каждые N часов…», tasks.json, тик планировщика
- Heartbeat-маркер без vendor telemetry
- Откат на closed core одной переменной

## UI vs бэкенд

Меню и тексты — копия бандла. Часть экранов (SSH/моботы через constructor API, полный monitor collector, OpenClaw install) показывает штатный UI, а действие ещё переносится или требует хаб/overlay.

## Что переносится дальше (по CONTRACT-*.md)

| Подсистема | Статус |
|------------|--------|
| Telegram UI (меню/команды) | паритет навигации 0.2 |
| agent-cc (полный stream, budget, subagents) | каркас → углублять |
| OpenClaw / agent-oc | заглушка + экраны |
| Monitor collector | UI есть, сбор — дальше |
| MCP install | UI есть, wiring — дальше |
| Multi-bot via constructor API | UI есть; на сервере — bot-ctl |
| Vendor sync/puller | выключены против open-core |

Эталон поведения и строки UI — в `vendor/deobfuscated.js` и CHANGELOG.md.

## Тесты

```bash
cd .iia/bot && npm test
```

## Политика обновлений

Puller создателя тянул закрытый `bot/index.js` с их сервера. На open-core
это ломает смысл ветки. Не включай stock puller против этой ветки, либо
исключи `bot/**` из манифеста. Канал обвязки `overlay/iia-updates` — свой.
