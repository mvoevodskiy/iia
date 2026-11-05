# Engines (заготовка)

Закрытое ядро: Claude Code (`cc`) и OpenClaw (`oc`), экраны `eng:*` / `settings:engine:*`.

Open-core 0.1 отвечает только через `cc`. При `state.engine === "oc"` ход отклоняется
с подсказкой переключиться.

Дальше: порт `agent-oc` / `oc-bus` / `oc-oauth` из `vendor/deobfuscated.js` по лог-префиксам.
