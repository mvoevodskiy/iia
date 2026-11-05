# Обвязка MSB (opt-in)

Расширение ядра: CLI-провайдеры **Cursor / Codex / Qwen**, локальный SSH IP,
канал обновлений `msb-updates`.

Ядро работает **без** этой папки. Штатный вход: `node .msb/bot/index.js`.

## Состав

| Путь | Назначение |
|------|------------|
| `bot/run.mjs` | Точка входа: PATH-shim + `ext/install.mjs` → `index.js` |
| `bot/ext/` | Адаптеры, меню «Подключения», auth, модели |
| `bot/systemd/60-ext-entry.conf` | Drop-in: `ExecStart` → `run.mjs` |
| `usr-local-bin/bot-ctl.sh` | Расширенный ctl (`add` / `remove` для LAN) |
| `msb-updates/` | Хаб публикации релизов и TG/веб-установщик |

## Установка на уже стоящее ядро

```bash
sudo /opt/msb-src/overlay/install.sh --source /opt/msb-src --target /home/client
sudo bot-ctl.sh restart all   # или restart default
```

Откат к чистому ядру:

```bash
sudo rm -f /etc/systemd/system/msb-bot@.service.d/60-ext-entry.conf
sudo systemctl daemon-reload
# опционально убрать код обвязки:
#   rm -rf /home/client/.msb/bot/ext /home/client/.msb/bot/run.mjs
sudo bot-ctl.sh restart all
```

После отката снова стартует штатный `index.js` из unit’а ядра.

## Разработка / тесты

```bash
cd overlay/bot && node --test ext/tests/*.test.mjs
```

На сервере с обвязкой те же тесты: `node --test /home/client/.msb/bot/ext/tests/*.test.mjs`.
