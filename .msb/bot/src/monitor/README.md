# Monitor (open-core)

Данные: `~/.msb/monitor/config.json`, `items.jsonl`, `meta.json`.

Поддерживаемые источники:
- RSS / Atom
- YouTube (через channel RSS, `@handle` резолвится)
- GitHub (releases.atom → commits.atom)
- Telegram public (`t.me/s/…`)
- X/Twitter (нужен `X_BEARER_TOKEN`)

Сбор: каждые 5 минут + кнопка «Собрать всё сейчас».  
Дайджест: по часу из настроек (TZ `MSB_TIMEZONE`) или «Прислать сейчас».
