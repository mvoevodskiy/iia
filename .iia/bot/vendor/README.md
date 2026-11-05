# Vendor reference (закрытое ядро)

| Файл | Назначение |
|------|------------|
| `index.closed.js` | Исходный минифицированный бандл (~3 МБ) |
| `deobfuscated.js` | webcrack unminify (~122k строк) — эталон при переносе фич |
| `snippets/` | Вырезки ключевых участков с номерами строк |
| `CONTRACT-*.md` | Контракты подсистем (agent-cc, state/menus, autonomy) |

Open-core **не импортирует** эти файлы в рантайме (кроме `IIA_USE_CLOSED_CORE=1` → `index.closed.js`).

Как препарировать дальше:

```bash
# поиск модуля по лог-префиксу
rg '\[iia/agent-cc\]' deobfuscated.js

# сравнение поведения
IIA_USE_CLOSED_CORE=1 node ../index.js   # эталон
node ../index.js                         # open-core
```
