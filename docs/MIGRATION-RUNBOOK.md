# Runbook: przejscie trzech projektow na wspolna baze `shared_mysql`

Kolejnosc wynika z waznosci: najpierw najmniej wazny (llmetrics, jako proba), potem worklogger
(z automatyzacja GitHub Actions), potem emergency_desk (demo, aktualizowany recznie), na koncu Tattoo Gallery.
Kazda faza jest odwracalna: dane zrodlowe nie sa usuwane, a rollback to `docker start` starego MySQL
i przywrocenie starego pliku compose.

Katalogi projektow na serwerze zakladam jako `~/docker/<projekt>` (zmien, jesli sa inne).

| Projekt | Kontener MySQL (zrodlo) | Aplikacje uzywajace bazy | Baza | Uzytkownik |
|---|---|---|---|---|
| llmetrics | `llmetrics_mysql_prod` | `llmetrics_backend_prod`, `llmetrics_queue_worker` | `llmetrics` | `llmetrics_user@%` |
| worklogger | `worklogger_mysql_prod` | `worklogger_app_prod` | `worklogger_prod` | `worklogger_user@%` |
| emergency_desk | `ed_mysql_prod` | `ed_backend_prod`, `ed_queue_worker`, `ed_push_notification_worker`, `ed_schedule_worker` | `emergency_desk_prod` | `ed_prod_user@%` |

## Faza 0: przygotowanie (tylko odczyt i kopie)

```bash
free -h                                          # available > ok. 700 MB
docker ps --format 'table {{.Names}}\t{{.Status}}' | grep -E 'shared_mysql|_mysql_'
cd ~/docker/mysql && ./backup.sh                 # kopia pustej wspolnej instancji (test)
# z komputera (katalog projektu tattoo gallery):
scp scripts/migrate-db.sh infra/mysql/backup.sh USER@SERWER:docker/mysql/
chmod +x ~/docker/mysql/migrate-db.sh

# kopia KAZDEGO zrodla przed ruszeniem czegokolwiek (haslo root wpisz w znaku zachecenia)
mkdir -p ~/backups-pre-migration && umask 077
for c in llmetrics_mysql_prod worklogger_mysql_prod ed_mysql_prod; do
  read -rsp "root $c: " P; echo
  docker exec -e MYSQL_PWD="$P" $c mysqldump -uroot --all-databases --single-transaction --routines --triggers --events \
    | gzip > ~/backups-pre-migration/$c-$(date +%F).sql.gz
  gzip -t ~/backups-pre-migration/$c-$(date +%F).sql.gz && echo "OK $c"
done
```
Hasla root zrodel sa w plikach `.env` tych projektow (`DB_PASSWORD` / `MYSQL_ROOT_PASSWORD`).

## Wzorzec jednej migracji (fazy 1-3)

Dla projektu `X`: (1) zatrzymaj aplikacje (nie baze), (2) `migrate-db.sh`, (3) podmien compose i `.env`,
(4) uruchom aplikacje i sprawdz, (5) wylacz stary MySQL **tak, by nie wrocil po restarcie Dockera**
(maja `restart: always`): `docker update --restart=no <mysql>` i dopiero `docker stop <mysql>`.

Haslo root nowej instancji jest w `~/docker/mysql/.env` (`MYSQL_ROOT_PASSWORD`).

## Faza 1: llmetrics (proba)

```bash
cd ~/docker/llmetrics
docker stop llmetrics_backend_prod llmetrics_queue_worker

cd ~/docker/mysql
read -rsp "root zrodla llmetrics: " SRC_PWD; echo
read -rsp "root shared_mysql: " DST_PWD; echo
export SRC_PWD DST_PWD
./migrate-db.sh llmetrics_mysql_prod shared_mysql llmetrics 'llmetrics_user@%'     # kod 0 = wszystko zgodne
unset SRC_PWD DST_PWD

# z komputera: scp ~/projects/llmetrics/docker-compose.shared-db.yml USER@SERWER:docker/llmetrics/
cd ~/docker/llmetrics
docker compose -f docker-compose.shared-db.yml up -d       # ostrzezenie o "orphan" mysql jest oczekiwane
docker logs --tail 30 llmetrics_backend_prod                # brak bledow polaczenia z baza
docker update --restart=no llmetrics_mysql_prod && docker stop llmetrics_mysql_prod
free -h
```
Rollback: `docker stop llmetrics_backend_prod llmetrics_queue_worker`, `docker start llmetrics_mysql_prod`,
`docker compose -f docker-compose.prod.yml up -d`.

## Faza 2: worklogger (z GitHub Actions)

```bash
cd ~/docker/worklogger
docker stop worklogger_app_prod

cd ~/docker/mysql
read -rsp "root zrodla worklogger: " SRC_PWD; echo; read -rsp "root shared_mysql: " DST_PWD; echo; export SRC_PWD DST_PWD
./migrate-db.sh worklogger_mysql_prod shared_mysql worklogger_prod 'worklogger_user@%'
unset SRC_PWD DST_PWD

cd ~/docker/worklogger
cp .env .env.bak-przed-shared-db
sed -i 's/@mysql:/@shared_mysql:/' .env                    # DATABASE_URL: host mysql -> shared_mysql
grep -o '@[^:/]*:[0-9]*/' .env                             # powinno byc @shared_mysql:3306/ (bez wypisywania hasla)
cp docker-compose.prod.yml docker-compose.prod.yml.bak     # kopia starego pliku
# z komputera: scp ~/projects/work_logger/docker-compose.prod.yml USER@SERWER:docker/worklogger/
docker compose -f docker-compose.prod.yml up -d
docker logs --tail 30 worklogger_app_prod                   # sprawdz logowanie / strone w przegladarce
docker update --restart=no worklogger_mysql_prod && docker stop worklogger_mysql_prod
```
**GitHub Actions nie wymaga zmian:** workflow robi `pull` i `up -d` w `~/docker/worklogger` na pliku, ktory
tam lezy, wiec po podmianie pliku compose kolejny push dziala na wspolnej bazie. Plik compose nie jest
wdrazany przez workflow, wiec kazda przyszla zmiana compose = reczny `scp`.
Jesli na serwerze jest cron lub skrypt kopii wolajacy `docker exec worklogger_mysql_prod ...`, zmien go
na `shared_mysql` (kopie calej instancji robi juz `~/docker/mysql/backup.sh`).
Rollback: przywroc `.env.bak-przed-shared-db` i `docker-compose.prod.yml.bak`, `docker start worklogger_mysql_prod`,
`docker compose -f docker-compose.prod.yml up -d`.

## Faza 3: emergency_desk (demo, recznie)

Uzywaj `docker-compose.demo.yml` (osobny plik; `docker-compose.prod.yml` z produkcji na innym serwerze
zostaje bez zmian).

```bash
cd ~/docker/emergency_desk
docker stop ed_backend_prod ed_queue_worker ed_push_notification_worker ed_schedule_worker

cd ~/docker/mysql
read -rsp "root zrodla ed: " SRC_PWD; echo; read -rsp "root shared_mysql: " DST_PWD; echo; export SRC_PWD DST_PWD
./migrate-db.sh ed_mysql_prod shared_mysql emergency_desk_prod 'ed_prod_user@%'
unset SRC_PWD DST_PWD

# z komputera: scp ~/projects/emergency_desk/docker-compose.demo.yml USER@SERWER:docker/emergency_desk/
cd ~/docker/emergency_desk
docker compose -f docker-compose.demo.yml up -d
docker logs --tail 30 ed_backend_prod
docker update --restart=no ed_mysql_prod && docker stop ed_mysql_prod
```
Od teraz na tym serwerze zawsze `-f docker-compose.demo.yml`.

## Faza 4: Tattoo Gallery

```bash
# z komputera: scp .env.server USER@SERWER:docker/tatoo_gallery/.env      (plik ignorowany przez git)
cd ~/docker/tatoo_gallery
set -a; . ./.env; set +a                      # MYSQL_USER, MYSQL_PASSWORD
read -rsp "root shared_mysql: " R; echo
docker exec -i -e MYSQL_PWD="$R" shared_mysql mysql -uroot <<SQL
CREATE DATABASE tattoogallery CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER '$MYSQL_USER'@'%' IDENTIFIED BY '$MYSQL_PASSWORD';
GRANT ALL PRIVILEGES ON tattoogallery.* TO '$MYSQL_USER'@'%';
SQL
unset R MYSQL_PASSWORD
```
Potem `git push origin main` (workflow zbuduje obraz i wdroży) oraz Proxy Host w NPM
(`tattoogallery_app`, port 3000).

## Po wszystkim

```bash
docker exec -it shared_mysql mysql -uroot -p -e "SHOW DATABASES; SELECT user,host,plugin FROM mysql.user WHERE user NOT LIKE 'mysql.%';"
free -h
```
Po ok. tygodniu bez problemow: usun stare kontenery MySQL i ich wolumeny (po sprawdzeniu `docker volume ls`).
Stare porty bazy (3307/3308/3309) znikaja razem z kontenerami.

## Bezpieczenstwo: porty publikowane na wszystkich interfejsach

Obecne pliki compose publikuja bez `127.0.0.1`: MySQL worklogger (`3308:3306`), backend llmetrics (`8000:8000`)
i backend emergency_desk (`8001:8000`). Takie porty sa dostepne z zewnatrz, jesli firewall ich nie blokuje.
Sprawdz: `sudo ss -tlnp | grep -E ':(3308|8000|8001)\b'` i `sudo ufw status` (albo reguly dostawcy VPS).
Porty MySQL znikna po migracji; backendy przypnij do `127.0.0.1` lub zablokuj firewallem.
