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

## 1. Nowa, osobna instancja wspólna

Wspólna baza to **osobny projekt Compose** ([infra/mysql/](../infra/mysql/)), niezależny od aplikacji.
Dzięki temu zatrzymanie, aktualizacja czy usunięcie dowolnej aplikacji nie dotyka bazy pozostałych.
Obecne instancje (np. 3 istniejące) stają się wyłącznie **źródłami migracji**.

```bash
mkdir -p ~/docker/mysql && cd ~/docker/mysql
# skopiuj z repozytorium: docker-compose.yml, .env.example (-> .env), backup.sh
cp .env.example .env && chmod 600 .env && nano .env      # MYSQL_ROOT_PASSWORD: openssl rand -hex 16
free -h                                                  # PRZED startem: available > ok. 700 MB
docker compose up -d && docker compose ps               # sieć db-net tworzy ten projekt
```

Instancja ma `performance_schema=OFF`, `innodb_buffer_pool_size=192M` i `mem_limit` 768 MB; bazy są
rzędu MB, więc to z zapasem wystarcza. Port nie jest wystawiony na hosta, dostęp tylko przez `db-net`.

**Pamięć podczas migracji:** nowa instancja działa równolegle ze starymi, dopóki ich nie wyłączysz.
Migruj po jednej bazie i po każdej zatrzymaj stary MySQL (krok `d` w sekcji 2) – pamięć zwalnia się
stopniowo. Jeśli `free -h` pokazuje mniej niż ~700 MB, najpierw zatrzymaj coś nieużywanego.

**Kopie zapasowe** (obowiązkowe, bo to jedna instancja dla wszystkich):
```bash
chmod +x backup.sh && ./backup.sh            # test: tworzy backups/all-<data>.sql.gz i sprawdza go
crontab -e                                   # 15 3 * * * /home/<user>/docker/mysql/backup.sh >> /home/<user>/docker/mysql/backup.log 2>&1
```
Skrypt weryfikuje kopię (gzip + znacznik „Dump completed”) i rotuje pliki starsze niż 14 dni. Zadbaj,
żeby katalog `backups/` trafiał też poza serwer (rsync/rclone) – kopia na tym samym dysku nie chroni przed jego awarią.

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
./migrate-db.sh S_db shared_mysql <baza> '<uzytkownik>@%'
# skrypt kończy się kodem 0 tylko gdy wszystkie tabele się zgadzają

# c) przepnij aplikację: w jej compose/.env zmień host bazy na `shared_mysql`,
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

Na wspólnej instancji (`docker exec -it shared_mysql mysql -uroot -p`) utwórz bazę i użytkownika, a w `.env` aplikacji ustaw `DB_HOST=shared_mysql`, `DB_NETWORK=db-net`:

```sql
CREATE DATABASE tattoogallery CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'tattoo'@'%' IDENTIFIED BY '<haslo>';
GRANT ALL PRIVILEGES ON tattoogallery.* TO 'tattoo'@'%';
```
Migracje Prisma wykonują się przy starcie kontenera (`prisma migrate deploy`) – użytkownik potrzebuje
uprawnień do tworzenia i zmiany tabel w swojej bazie (stąd `ALL` na tej jednej bazie).
