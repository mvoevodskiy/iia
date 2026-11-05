# MSB ext — Cursor / Codex / Qwen в том же боте

Расширение поверх закрытого бандла `bot/index.js` **без** развёртывания OpenClaw.

## Идея (экологичность к обновлениям)

| Слой | Что | Переживает puller? |
|------|-----|-------------------|
| `bot/index.js` | штатный бандл создателя | заменяется обновлением |
| `bot/run.mjs` | наша точка входа | да (не в манифесте) |
| `bot/ext/**` | провайдеры, меню, shim | да |
| `~/.msb/ext-tools/` | npm-пакеты Codex/Qwen | да |
| drop-in `60-ext-entry.conf` | `ExecStart=…/run.mjs` | да (в /etc) |

**Бандл не патчим.**

1. `run.mjs` ставит в `PATH` shim `ext/shim/bin/claude` + `~/.msb/ext-tools/bin` + `~/.local/bin`.
2. До `import('./index.js')` патчит **тот же** ESM-класс `Bot` из grammy — перехват «🔌 Подключение».
3. Если активен не Claude, shim отвечает бандлу Claude stream-json, внутри зовёт `agent` / `codex` / `qwen` с их инструментами (`--force` / `danger-full-access` / `--yolo`).

На движке OpenClaw (`state.engine === "oc"`) штатное «Подключение» не перехватывается.

## Меню

`/settings` → **🔌 Подключения** — совмещённый экран (не вместо штатного, а с ним):

**Штатные (бандл):** Claude · токен, OpenRouter, OpenClaw, движок Claude — уходят в `index.js`.
**Обвязка (CLI):** Cursor / Codex / Qwen (+ Claude CLI как активный канал shim).

1. Cursor/Qwen — «🔑 Ключ» → ключ сообщением в `.env` бота.
2. Codex — «🔑 Войти» → ChatGPT device login; секрет в Telegram не просим (`~/.codex/auth.json`).
3. Неуспешный login Codex **не** переключает канал.
4. Выбор OpenRouter/OpenClaw сбрасывает активный CLI-канал обвязки, чтобы shim не перехватывал ход.

Активный: `~/.msb/bots/<id>/ext-providers.json`.

«Назад» из «🔌 Подключение» ведёт в `menu:settings` (настройки), не в «Агент → Модель».

При активном Cursor/Codex/Qwen экраны **🧠 Агент**, **🧠 Модель**, **💭 Глубина**, **🔐 Режим** показывают текущего провайдера и его модель — не Claude Opus/Sonnet. Выбор модели/глубины пишется в `ext-providers.json` (`models` / `efforts`); для Codex ещё в `~/.codex/config.toml`.

Штатный Setup Mode смотрит только на Claude OAuth / Anthropic key. Поэтому при активном Cursor/Codex/Qwen с валидной auth расширение пишет в `state.json` `authMode=subscription` и маркер `extAuthBypass` — иначе сообщения блокируются текстом «AI ещё не подключён» и до shim не доходят. При возврате на Claude маркер и чужой `ext:` session id снимаются.

## Автоустановка CLI

| Провайдер | Как ставится |
|-----------|----------------|
| Cursor | `curl https://cursor.com/install \| bash` → обычно `~/.local/bin/agent` |
| Codex | `npm i -g --prefix ~/.msb/ext-tools @openai/codex@0.166.0` (версия закреплена) |
| Qwen | `npm i -g --prefix ~/.msb/ext-tools @qwen-code/qwen-code` |

Срабатывает при входе / выборе провайдера, если бинаря нет. Нужны сеть и `npm`/`curl` у пользователя `client`.

## Авторизация

| Провайдер | Что делает бот |
|-----------|----------------|
| Claude | штатный `claude setup-token` → `CLAUDE_CODE_OAUTH_TOKEN` |
| Cursor | `CURSOR_API_KEY` в .env (официальный способ для headless) |
| Codex | нативный `~/.codex/auth.json` (ChatGPT login / device code). Ключ в .env не обязателен |
| Qwen | ключ в .env + `~/.qwen/settings.json` (`selectedType: openai`) и `~/.qwen/.env`; `sk-sp-` → Token Plan URL |

## Codex: ход и сессии

- Модель и `model_reasoning_effort` берутся из `~/.codex/config.toml`; Claude-алиасы бандла (`claude-opus-…`) в OpenAI **не** передаются.
- Права: `--sandbox danger-full-access`, `-c approval_policy="never"`.
- Транспорт: HTTP-only provider `msb_http` (`supports_websockets = false`) — обход обрывов Responses WebSocket (`Reconnecting… 5/5`). При обрыве — один автоповтор новым тредом.
- Успех хода: `turn.completed` + непустой текст + валидный native `thread_id`. Служебный `norestart` не блокирует следующий ход.
- Init/result отдают один подтверждённый session id; сбой `setSession` не глотает уже полученный ответ.
- В поток бота уходят фактическая модель и native usage; сырой stderr CLI в журнал процесса не дублируется.

## Инструменты

Инструменты выполняет **сам CLI** провайдера (запись файлов, shell и т.д.), не эмуляция tool_use Claude в Telegram. Флаги: Cursor `--force --trust`, Codex `danger-full-access` + `approval_policy=never`, Qwen `--yolo`.

## Установка на сервер

```bash
chmod +x ~/.msb/bot/ext/shim/bin/claude
sudo mkdir -p /etc/systemd/system/msb-bot@.service.d
sudo cp ~/.msb/bot/systemd/60-ext-entry.conf /etc/systemd/system/msb-bot@.service.d/
sudo systemctl daemon-reload
sudo bot-ctl.sh restart all   # код общий — подхватывают все инстансы
```

Drop-in шаблонный (`msb-bot@.service.d`): новый бот из «Мои боты» сразу стартует через `run.mjs`.

Проверка: в боте «🔌 Подключение» → Cursor/Qwen (ключ) или Codex («Войти») → дождаться успеха → написать сообщение агенту.

## Обновления

Канал обвязки публикуется сервисом `overlay/msb-updates` (отдельно от ядра). На боксе после установки:

```
MSB_UPDATES_URL=...
MSB_UPDATES_TOKEN=...   # индивидуальный install_box
node ~/.msb/bot/ext/update/cli.mjs check
node ~/.msb/bot/ext/update/cli.mjs apply
```

Установщик (TG + веб) ставит обвязку по SSH: владелец в настройках своего бота добавляет ключ и IP хаба — скрипты на сервере не нужны.

## Локальный SSH IP (LAN / без проброса :22)

Конструктор для «Мои боты» и «SSH доступ» ходит по SSH на **внешний** `vps_ip` клиента. Если бокс во внутренней сети и порт 22 снаружи не открыт — эти экраны падают (`VPS unreachable`).

Обход: `/settings` → «Системные» → «SSH доступ» → **🖧 Локальный SSH IP** (переменная `MSB_LOCAL_SSH_HOST`, например `192.168.1.10` или `127.0.0.1`). Тогда запросы `/api/ssh/*` и «Мои боты» (список / добавить / удалить) выполняются на этой машине через `sudo bot-ctl.sh`, без SSH с хаба и без внешнего IP. Нужны вход через `run.mjs` (drop-in `systemd/60-ext-entry.conf`) и актуальный `/usr/local/bin/bot-ctl.sh` с действиями `add` / `remove`.

## Ограничения

- В Telegram нет покадрового tool-stream как у Claude; виден итоговый текст хода.
- Сессии: `ext:<id>:<native>`, не смешиваются с Claude session id.
- `JARVIS_CC_ONLY=1` — только штатное Claude-меню.
- Бандл в system prompt всегда пишет «Claude Max» — shim добавляет Runtime override с активным провайдером, иначе агент повторяет шаблон.
