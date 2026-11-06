# Legacy: закрытая OS-обвязка Jarvis (только архив)

Сюда вынесены артефакты первоначального разработчика. **Не ставятся** bootstrap’ом.

| Было | Назначение |
|------|------------|
| `usr-local-sbin/jarvis-engine` | закрытый root-helper 0.5.9 |
| `systemd/jarvis-engine*` | path/tick/update/nft |
| `systemd/msb-base-pulse*` | pulse на SYNC создателя (ExecStart → jarvis-engine pulse) |
| `etc-sudoers.d/jarvis-client` | `client ALL=(ALL) NOPASSWD:ALL` |

Рабочая обвязка: `usr-local-sbin/msb-engine`, `usr-local-lib/msb-engine/`, `systemd/msb-engine*`.

Миграция живого бокса: `bootstrap/migrate-from-jarvis.sh` (чистит units/bin с сервера).
Откат к этому архиву сознательно не поддерживается как штатный путь — только ручной из снимка rollback на боксе.
