#!/usr/bin/env bash
# Kopia wszystkich baz wspólnej instancji do skompresowanego pliku + rotacja.
# Cron (codziennie 03:15):  15 3 * * *  /home/<user>/docker/mysql/backup.sh >> /home/<user>/docker/mysql/backup.log 2>&1
set -euo pipefail
cd "$(dirname "$0")"
CONTAINER=${CONTAINER:-shared_mysql}
DIR=${BACKUP_DIR:-$PWD/backups}
KEEP_DAYS=${KEEP_DAYS:-14}
set -a; [ -f .env ] && . ./.env; set +a
: "${MYSQL_ROOT_PASSWORD:?brak MYSQL_ROOT_PASSWORD w .env}"

mkdir -p "$DIR"; umask 077
OUT="$DIR/all-$(date +%F-%H%M).sql.gz"
docker exec -e MYSQL_PWD="$MYSQL_ROOT_PASSWORD" "$CONTAINER" \
  mysqldump -uroot --all-databases --single-transaction --routines --triggers --events \
  --default-character-set=utf8mb4 | gzip > "$OUT"
# pusty/uszkodzony plik nie może zastąpić dobrej kopii
gzip -t "$OUT" && [ "$(gzip -dc "$OUT" | tail -n 2 | grep -c 'Dump completed')" = 1 ] || { rm -f "$OUT"; echo "BŁĄD: kopia niepoprawna"; exit 1; }
find "$DIR" -name 'all-*.sql.gz' -mtime +"$KEEP_DAYS" -delete
echo "$(date -Is) OK $(du -h "$OUT" | cut -f1) $OUT"
