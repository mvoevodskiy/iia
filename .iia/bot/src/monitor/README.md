# Monitor (заготовка)

В закрытом ядре: источники (YouTube/Twitter/GitHub/TG/RSS), дайджесты, storage sqlite/supabase.

Перенос: ориентир `vendor/deobfuscated.js` (callback `mon:*`) + CHANGELOG 2.0.106+.

Планируемый API:

- `src/monitor/sources.mjs` — CRUD источников
- `src/monitor/digest.mjs` — сборка дайджеста через agent turn
- `src/monitor/storage.mjs` — sqlite по умолчанию
