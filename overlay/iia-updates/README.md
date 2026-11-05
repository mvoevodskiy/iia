# iia-updates

Сервис публикации обновлений ядра/обвязки и TG/веб-установщик.

- Каналы: `core` (зеркало as-is), `ext` (наша обвязка + `compatible_core`)
- Токены индивидуальные на `tg_user_id`
- Установка обвязки на живой бот: владелец открывает SSH в настройках бота (ключ+IP), хаб ставит сам

## Локально

```bash
cp deploy/env.example deploy/env   # или ~/iia-updates/env на хосте
npm install
IIA_UPDATES_DATA=./data node bin/publish.mjs --channel ext --version 0.1.0 \
  --from ../../.iia/bot --compatible-core-min 2026-10-20-bg-web-oc-session.v27.0
IIA_UPDATES_DATA=./data node bin/serve.mjs
```

## Порт для nginx

Прокинуть **8787** (HTTP):

- `/telegram/webhook` — webhook бота-установщика
- `/` и `/v1/*` — веб и API
