# Эталон старого поведения

[← Открытое ядро](../OPEN-CORE.md) · [Reference tests](../tests/reference/README.md)

| Файл | Назначение |
|---|---|
| [index.closed.js](index.closed.js) | Исходный закрытый bundle для сопоставления |
| [deobfuscated.js](deobfuscated.js) | Читаемый эталон сценариев и UI |
| [snippets](snippets/) | Вырезки с номерами строк оригинала |
| [state/menus](CONTRACT-state-menus.md), [agent-cc](CONTRACT-agent-cc.md), [autonomy](CONTRACT-autonomy.md) | Зафиксированные контракты подсистем |
| [UI-SCREENS](UI-SCREENS.md) | Каталог старых экранов |

Переносится поведение с адаптацией к модульному open-core. Этот каталог не является
runtime-реализацией поддерживаемого выпуска; `vendor/index.closed.js` не экспортируется
в его runtime. Исторический closed-core flag в исходном entrypoint не используется
как поддерживаемый откат: [release rollback](../../../tools/release/README.md) восстанавливает код.

Для поиска эталона используй названия UI, callback IDs и лог-префиксы в
`deobfuscated.js`. Полнота старого поведения проверяется по сценариям; наличие
файла vendor или отдельного зелёного теста само по себе её не доказывает.
