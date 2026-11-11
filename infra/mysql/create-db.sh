#!/usr/bin/env bash
# Tworzy baze i uzytkownika we wspolnej instancji MySQL (idempotentnie - mozna uruchomic ponownie,
# ponowne uruchomienie zmienia haslo uzytkownika i odswieza uprawnienia).
#
# Uzycie (na serwerze):
#   ./create-db.sh <baza> <uzytkownik> <haslo>
#   ./create-db.sh --env /sciezka/do/.env      # czyta MYSQL_DATABASE, MYSQL_USER, MYSQL_PASSWORD
# Haslo root: zmienna MYSQL_ROOT_PASSWORD lub plik .env obok skryptu (~/docker/mysql/.env).
# Haslo uzytkownika bez znakow specjalnych (np. openssl rand -hex 16) - trafia do URL-a DATABASE_URL.
set -euo pipefail
CONTAINER="${MYSQL_CONTAINER:-shared_mysql}"
HERE="$(cd "$(dirname "$0")" && pwd)"

if [ "${1:-}" = "--env" ]; then
  [ -f "${2:-}" ] || { echo "Brak pliku: ${2:-}" >&2; exit 1; }
  get() { grep -E "^$1=" "$2" | tail -1 | cut -d= -f2-; }
  DB="$(get MYSQL_DATABASE "$2")"; USR="$(get MYSQL_USER "$2")"; PWD_="$(get MYSQL_PASSWORD "$2")"
else
  DB="${1:-}"; USR="${2:-}"; PWD_="${3:-}"
fi
[ -n "$DB" ] && [ -n "$USR" ] && [ -n "$PWD_" ] || { sed -n 2,9p "$0" >&2; exit 1; }
[[ "$DB" =~ ^[A-Za-z0-9_]+$ && "$USR" =~ ^[A-Za-z0-9_]+$ ]] || { echo "Baza i uzytkownik: tylko A-Z a-z 0-9 _" >&2; exit 1; }
[[ "$PWD_" =~ ^[A-Za-z0-9]+$ ]] || { echo "Haslo: tylko litery i cyfry (np. openssl rand -hex 16)" >&2; exit 1; }

ROOT="${MYSQL_ROOT_PASSWORD:-}"
if [ -z "$ROOT" ] && [ -f "$HERE/.env" ]; then ROOT="$(grep -E '^MYSQL_ROOT_PASSWORD=' "$HERE/.env" | tail -1 | cut -d= -f2-)"; fi
[ -n "$ROOT" ] || { echo "Ustaw MYSQL_ROOT_PASSWORD albo umiesc .env obok skryptu" >&2; exit 1; }

docker exec -i -e MYSQL_PWD="$ROOT" "$CONTAINER" mysql -uroot <<SQL
CREATE DATABASE IF NOT EXISTS \`$DB\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '$USR'@'%' IDENTIFIED BY '$PWD_';
ALTER USER '$USR'@'%' IDENTIFIED BY '$PWD_';
GRANT ALL PRIVILEGES ON \`$DB\`.* TO '$USR'@'%';
FLUSH PRIVILEGES;
SQL
echo "OK: baza '$DB', uzytkownik '$USR'. Test:"
docker exec -e MYSQL_PWD="$PWD_" "$CONTAINER" mysql -u"$USR" -e "SELECT CURRENT_USER() AS user, DATABASE() AS db;" "$DB"
