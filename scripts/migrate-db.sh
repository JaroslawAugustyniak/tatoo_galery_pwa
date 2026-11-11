#!/usr/bin/env bash
# Przenosi JEDNĄ bazę MySQL z kontenera źródłowego do docelowego (wspólnej instancji),
# razem z użytkownikami i uprawnieniami (hasła przenoszone jako hasze - aplikacje nie wymagają zmiany haseł).
# NICZEGO nie usuwa ani nie zatrzymuje w źródle.
#
# Użycie:
#   SRC_PWD='<root źródła>' DST_PWD='<root docelowej>' \
#     ./migrate-db.sh <kontener_src> <kontener_dst> <baza> <user@host> [<user@host> ...]
# Przykład:
#   ./migrate-db.sh worklogger_db shared_mysql worklogger_prod 'worklogger_user@%'
#
# Zasady: baza docelowa nie może już istnieć (zapobiega nadpisaniu), a skrypt kończy się błędem
# przy rozbieżności liczby wierszy.
set -euo pipefail

[[ $# -ge 4 ]] || { sed -n '2,13p' "$0"; exit 2; }
SRC=$1; DST=$2; DB=$3; shift 3
USERS=("$@")
: "${SRC_PWD:?ustaw SRC_PWD}"; : "${DST_PWD:?ustaw DST_PWD}"
[[ "$DB" =~ ^[A-Za-z0-9_]+$ ]] || { echo "Nieprawidłowa nazwa bazy: $DB"; exit 2; }

# src/dst czytają stdin (do potoków); sq/dq to zapytania bez stdin - inaczej `docker exec -i`
# w pętli `while read` zjadałby jej wejście i weryfikacja pomijałaby tabele.
src() { docker exec -i -e MYSQL_PWD="$SRC_PWD" "$SRC" "$@"; }
dst() { docker exec -i -e MYSQL_PWD="$DST_PWD" "$DST" "$@"; }
sq()  { docker exec -e MYSQL_PWD="$SRC_PWD" "$SRC" mysql -uroot -N -B -r -e "$1" </dev/null; }
dq()  { docker exec -e MYSQL_PWD="$DST_PWD" "$DST" mysql -uroot -N -B -r -e "$1" </dev/null; }
sql_quote() { printf "%s" "$1" | sed "s/'/''/g"; }

echo "== Sprawdzam połączenia i warunki"
sq "SELECT VERSION()" | sed 's/^/źródło: /'
dq "SELECT VERSION()" | sed 's/^/cel:    /'
[[ -n "$(sq "SELECT 1 FROM information_schema.schemata WHERE schema_name='$DB'")" ]] || { echo "Baza $DB nie istnieje w źródle"; exit 1; }
[[ -z "$(dq "SELECT 1 FROM information_schema.schemata WHERE schema_name='$DB'")" ]] || { echo "Baza $DB JUŻ istnieje w celu - przerywam (nic nie nadpisuję)"; exit 1; }

DUMP="${DB}-$(date +%Y%m%d-%H%M%S).sql"
echo "== Zrzut do $DUMP"
src mysqldump -uroot --single-transaction --routines --triggers --events \
  --default-character-set=utf8mb4 --databases "$DB" > "$DUMP"
tail -n 2 "$DUMP" | grep -q "Dump completed" || { echo "Zrzut niekompletny"; exit 1; }
ls -lh "$DUMP" | awk '{print "rozmiar:", $5}'

echo "== Import do celu"
dst mysql -uroot < "$DUMP"

echo "== Użytkownicy i uprawnienia"
for ua in "${USERS[@]}"; do
  u=${ua%@*}; h=${ua##*@}
  [[ "$ua" == *@* ]] || { echo "Użytkownik musi mieć postać user@host: $ua"; exit 2; }
  uq=$(sql_quote "$u"); hq=$(sql_quote "$h")
  if [[ -n "$(dq "SELECT 1 FROM mysql.user WHERE user='$uq' AND host='$hq'")" ]]; then
    echo "  $ua już istnieje w celu - pomijam tworzenie, dodaję tylko uprawnienia"
  else
    sq "SHOW CREATE USER '$uq'@'$hq'" | sed 's/$/;/' | dst mysql -uroot
    echo "  utworzono $ua (hasz hasła i plugin skopiowane)"
  fi
  sq "SHOW GRANTS FOR '$uq'@'$hq'" | sed 's/$/;/' | dst mysql -uroot
done
dq "FLUSH PRIVILEGES"

echo "== Weryfikacja liczby wierszy"
bad=0; checked=0
expected=$(sq "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='$DB' AND table_type='BASE TABLE'")
while IFS= read -r t; do
  a=$(sq "SELECT COUNT(*) FROM \`$DB\`.\`$t\`"); b=$(dq "SELECT COUNT(*) FROM \`$DB\`.\`$t\`")
  [[ "$a" == "$b" ]] && s=OK || { s=ROZBIEŻNE; bad=1; }
  checked=$((checked+1))
  printf '  %-30s źródło=%-8s cel=%-8s %s\n' "$t" "$a" "$b" "$s"
done < <(sq "SELECT table_name FROM information_schema.tables WHERE table_schema='$DB' AND table_type='BASE TABLE' ORDER BY 1")
[[ "$checked" == "$expected" ]] || { echo "BŁĄD: sprawdzono $checked z $expected tabel"; exit 1; }
[[ $bad -eq 0 ]] || { echo "BŁĄD: rozbieżności - nie przełączaj aplikacji"; exit 1; }

cat <<MSG

Gotowe. Dalej (ręcznie):
  1. Aplikacja ma wskazywać host bazy: $DST (w jej sieci Docker musi być sieć wspólna db-net).
  2. Uruchom aplikację i sprawdź ją. Użytkownik i hasło bez zmian.
  3. Źródła nie usuwaj przez ok. tydzień. Zrzut zostaje w pliku: $DUMP
MSG
