# Wdrożenie (GitHub Actions → GHCR → serwer z Dockerem)

Push na `main` uruchamia pipeline: **test** (`tsc`) → **build** obrazu (target `prod`) i push do GHCR →
**deploy** przez SSH (`docker compose pull` + `up -d`, migracje Prisma startują razem z kontenerem).

## 1. Jednorazowa konfiguracja serwera

Wymagania: Docker + Compose v2, działający **nginx-proxy** (z acme-companion do certyfikatów) w sieci
`nginx-proxy-network`, rekord DNS `A` domeny wskazujący na serwer. HTTPS jest obowiązkowy – bez niego
Service Worker (tryb offline) i cookie sesji (`Secure`) nie zadziałają.

```bash
sudo mkdir -p /opt/tattoo-gallery && sudo chown $USER /opt/tattoo-gallery
docker network ls | grep nginx-proxy-network        # sieć musi istnieć
cd /opt/tattoo-gallery
# wzór: .env.server.example z repozytorium -> .env, uzupełnij WSZYSTKIE wartości
chmod 600 .env
openssl rand -hex 32                                 # wartość dla SESSION_SECRET
```

Konto do deployu (najlepiej osobny użytkownik z dostępem do Dockera) i klucz SSH tylko dla CI:

```bash
ssh-keygen -t ed25519 -f deploy_key -C "gh-actions-deploy" -N ""   # lokalnie
# deploy_key.pub -> ~/.ssh/authorized_keys na serwerze
ssh-keyscan -p 22 TWOJ_SERWER                          # -> sekret SSH_KNOWN_HOSTS
```

## 2. Sekrety GitHub (Settings → Secrets and variables → Actions)

Zalecane: environment **production** (Settings → Environments), opcjonalnie z wymaganą akceptacją.

| Nazwa | Typ | Wartość |
|---|---|---|
| `SSH_HOST` | secret | adres serwera |
| `SSH_USER` | secret | użytkownik deployu |
| `SSH_PRIVATE_KEY` | secret | zawartość `deploy_key` |
| `SSH_KNOWN_HOSTS` | secret | wynik `ssh-keyscan` |
| `SSH_PORT` | secret (opcj.) | domyślnie 22 |
| `GHCR_PULL_TOKEN` | secret (opcj.) | PAT (classic) z `read:packages`, jeśli pakiet w GHCR jest prywatny |
| `DEPLOY_PATH` | variable (opcj.) | domyślnie `/opt/tattoo-gallery` |

Pakiet w GHCR jest domyślnie prywatny: albo podaj `GHCR_PULL_TOKEN`, albo po pierwszym buildzie ustaw
widoczność pakietu na publiczną (Packages → ustawienia pakietu).

## 3. Pierwszy deploy

`git push origin main` (lub Actions → CI/CD → Run workflow). Po sukcesie galeria działa pod
`https://APP_DOMAIN`, a panel pod `/admin`. Pierwsze konto zakłada się przez rejestrację (kod 2FA przyjdzie
mailem przez Resend – dlatego klucz Resend i zweryfikowana domena nadawcy są wymagane w `.env`).

## 4. Operacje

```bash
cd /opt/tattoo-gallery
alias dc='docker compose --env-file .env --env-file image.env -f docker-compose.server.yml'
dc ps && dc logs -f app

# Rollback: wskaż poprzedni obraz (tag = SHA commita z GHCR)
echo 'IMAGE_REF=ghcr.io/<owner>/<repo>:<poprzedni-sha>' > image.env && dc up -d app
```

Migracje wykonują się tylko „do przodu”. Rollback do obrazu ze starszym schematem bazy wymaga ręcznego
przywrócenia kopii bazy.

### Kopie zapasowe (ustaw w cronie)

```bash
# baza
docker exec tattoogallery_db sh -c 'mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction "$MYSQL_DATABASE"' | gzip > backup-db-$(date +%F).sql.gz
# zdjęcia (wolumen uploadów)
docker run --rm -v tattoogallery_uploads:/data -v "$PWD":/out alpine tar czf /out/backup-uploads-$(date +%F).tgz -C /data .
```

## 5. Uwagi

- Subdomeny tatuatorów (`slug.domena`) nie są włączone: galerie działają pod `/t/slug`. Włączenie wymaga
  wildcard DNS i certyfikatu wildcard (DNS-01) oraz `VIRTUAL_HOST` z `*.domena`.
- `docker-compose.yml` to środowisko lokalne (kod z bind mounta, `next dev`). Serwer używa wyłącznie
  `docker-compose.server.yml`.
