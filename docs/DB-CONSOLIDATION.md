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

Skrypt [scripts/migrate-db.sh](../scripts/migrate-db.sh) robi zrzut, import, przenosi użytkowników **razem z
haszami haseł i typem uwierzytelniania** (`mysql_native_password` / `caching_sha2_password`), kopiuje
uprawnienia i porównuje liczbę wierszy każdej tabeli. Odmawia, jeśli baza docelowa już istnieje, i niczego
nie usuwa w źródle. Aplikacje nie wymagają zmiany haseł – zmienia się tylko host bazy.

Skopiuj skrypt na serwer, a potem dla każdej aplikacji `S` (kontener bazy źródłowej `S_db`, aplikacji `S_app`):

```bash
# a) zamroź zapisy: zatrzymaj TYLKO aplikację (baza działa)
docker stop S_app

# b) migracja (hasła root podaj w zmiennych, nie w historii poleceń: read -rs)
read -rsp "root źródła: " SRC_PWD; echo; read -rsp "root celu: " DST_PWD; echo; export SRC_PWD DST_PWD
./migrate-db.sh S_db <kontener_docelowy> <baza> '<uzytkownik>@%'
# skrypt kończy się kodem 0 tylko gdy wszystkie tabele się zgadzają

# c) przepnij aplikację: w jej compose/.env zmień host bazy na nazwę kontenera docelowego,
#    dodaj do jej kontenera sieć db-net (external: true), usuń z jej compose serwis MySQL. Potem:
docker compose up -d && docker compose logs --tail 50 S_app     # sprawdź, czy działa

# d) dopiero po testach: zatrzymaj stary S_db; kontener i wolumen usuń po ok. tygodniu
docker stop S_db
```

Użytkowników podaj w postaci `user@host` (host tak, jak w `mysql.user`, zwykle `%`). Listę znajdziesz w
inwentaryzacji (sekcja 0). Zrzut `.sql` zostaje w katalogu, z którego uruchomiłeś skrypt – to dodatkowa kopia.

> Uwaga: bazy z użytkownikami `caching_sha2_password` i `mysql_native_password` mogą współistnieć w jednej
> instancji. W MySQL 8.0 oba pluginy są aktywne; w 8.4+ `mysql_native_password` jest domyślnie wyłączony.

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
