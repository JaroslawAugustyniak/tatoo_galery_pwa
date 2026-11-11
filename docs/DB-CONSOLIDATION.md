# Konsolidacja baz danych do jednej instancji MySQL

Cel: zamiast osobnego MySQL w każdym projekcie (~350–500 MB RAM każdy) – **jedna** instancja, a w niej
osobna baza i osobny użytkownik dla każdej aplikacji. Aplikacje łączą się z nią po nazwie kontenera
przez wspólną sieć Dockera `db-net`.

> Zasada: nic nie usuwamy, dopóki aplikacja nie przejdzie testów na nowej bazie. Stare kontenery i wolumeny
> zostają jako kopia zapasowa jeszcze ok. tydzień.

## 0. Inwentaryzacja (tylko odczyt)

Dla każdego kontenera MySQL/MariaDB: wersja, bazy i rozmiary, kto z nich korzysta.

```bash
docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Networks}}' | grep -iE 'mysql|maria'
C=<kontener>; read -rsp "root pwd: " P; echo
docker exec -e MYSQL_PWD="$P" $C mysql -uroot -e "SELECT VERSION();
  SELECT table_schema AS db, ROUND(SUM(data_length+index_length)/1048576,1) AS MB FROM information_schema.tables
  WHERE table_schema NOT IN ('mysql','sys','information_schema','performance_schema') GROUP BY 1;
  SELECT user,host,plugin FROM mysql.user WHERE user NOT LIKE 'mysql.%';"
```

Sprawdź kolizje nazw baz między instancjami (dwie aplikacje z bazą `app` itp.) – przy kolizji jedną
z baz nazwij inaczej i zmień jej nazwę w konfiguracji aplikacji.

## 1. Wybór instancji docelowej i sieć wspólna

Zostaje instancja jednego z serwisów (ta z danymi, które mają zostać). Zalecenie: wersja 8.0, ta
najstabilniejsza i najlepiej utrzymywana.

```bash
docker network create db-net                      # raz
docker network connect db-net <kontener_docelowy> # działa od razu
```
Utrwal to w compose tego serwisu (sekcja `networks:` kontenera MySQL: `db-net` jako `external: true`),
inaczej połączenie zniknie po jego odtworzeniu. Instancji nie wystawiaj na port hosta.

Ustawienia oszczędzające pamięć (parametry `command:` kontenera docelowego):
`--performance-schema=OFF --innodb-buffer-pool-size=256M --max-connections=100`
oraz `mem_limit: 1g`. Przy zmianie `command:` kontener się zrestartuje – zrób to w oknie serwisowym.

## 2. Migracja jednej bazy (powtórz dla każdej)

Przykład: serwis `S` z kontenerem MySQL `S_db`, bazą `S_DB`, aplikacją `S_app`.

```bash
# a) zamroź zapisy: zatrzymaj TYLKO aplikację (baza działa)
docker stop S_app

# b) zrzut spójny, z procedurami i triggerami
docker exec -e MYSQL_PWD="$SRC_ROOT" S_db mysqldump -uroot --single-transaction --routines --triggers \
  --default-character-set=utf8mb4 --databases S_DB > S_DB.sql
ls -lh S_DB.sql && tail -3 S_DB.sql          # musi kończyć się linią "-- Dump completed"

# c) na instancji docelowej: import (--databases w zrzucie samo tworzy bazę)
docker exec -i -e MYSQL_PWD="$DST_ROOT" DST_DB mysql -uroot < S_DB.sql

# d) użytkownik tylko do tej bazy (hasło: openssl rand -hex 16)
docker exec -i -e MYSQL_PWD="$DST_ROOT" DST_DB mysql -uroot <<SQL
CREATE USER 'S_user'@'%' IDENTIFIED BY '<haslo>';
GRANT ALL PRIVILEGES ON \`S_DB\`.* TO 'S_user'@'%';
FLUSH PRIVILEGES;
SQL
```
Starsze aplikacje (PHP/Laravel ze starym sterownikiem) mogą wymagać
`IDENTIFIED WITH mysql_native_password BY '...'` – sprawdź w inwentaryzacji kolumnę `plugin`.

```bash
# e) weryfikacja: liczba tabel i wierszy musi się zgadzać ze źródłem
Q="SELECT table_name, table_rows FROM information_schema.tables WHERE table_schema='S_DB' ORDER BY 1;"
diff <(docker exec -e MYSQL_PWD="$SRC_ROOT" S_db mysql -uroot -N -e "$Q") \
     <(docker exec -e MYSQL_PWD="$DST_ROOT" DST_DB mysql -uroot -N -e "$Q") && echo "zgodne"
```
(`table_rows` w InnoDB jest przybliżone; dla ważnych tabel dodatkowo porównaj `SELECT COUNT(*)`.)

```bash
# f) przepnij aplikację: w jej compose/.env zmień host bazy na nazwę kontenera docelowego (DST_DB),
#    dodaj do jej kontenera sieć db-net (external), usuń z jej compose serwis MySQL,
#    zaktualizuj użytkownika/hasło. Potem:
docker compose up -d && docker compose logs --tail 50 app   # sprawdź, czy łączy się i działa

# g) dopiero po testach: zatrzymaj stary S_db, a po tygodniu usuń kontener i wolumen
docker stop S_db
```

## 3. Nowe serwisy (w tym Tattoo Gallery)

Na instancji docelowej utwórz bazę i użytkownika, a w `.env` aplikacji ustaw `DB_HOST`, `DB_NETWORK=db-net`:

```sql
CREATE DATABASE tattoogallery CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'tattoo'@'%' IDENTIFIED BY '<haslo>';
GRANT ALL PRIVILEGES ON tattoogallery.* TO 'tattoo'@'%';
```
Migracje Prisma wykonują się przy starcie kontenera (`prisma migrate deploy`) – użytkownik potrzebuje
uprawnień do tworzenia i zmiany tabel w swojej bazie (stąd `ALL` na tej jednej bazie).

## 4. Kopie zapasowe wspólnej instancji (cron)

```bash
docker exec -e MYSQL_PWD="$DST_ROOT" DST_DB mysqldump -uroot --single-transaction --routines --triggers \
  --all-databases | gzip > /backup/mysql-$(date +%F).sql.gz
```
Przed pierwszą migracją zrób kopię **każdej** instancji, z której będziesz przenosić dane.
