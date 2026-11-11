# Wdrożenie (GitHub Actions → GHCR → serwer z Dockerem)

Push na `main` uruchamia pipeline: **test** (`tsc`) → **build** obrazu (target `prod`) i push do GHCR →
**deploy** przez SSH (`docker compose pull` + `up -d`, migracje Prisma startują razem z kontenerem).

## 1. Jednorazowa konfiguracja serwera

Wymagania: Docker + Compose v2, działający **Nginx Proxy Manager** (NPM), rekord DNS `A` domeny `tatoo.asapcreative.agency` wskazujący na IP serwera. HTTPS jest obowiązkowy – bez niego
Service Worker (tryb offline) i cookie sesji (`Secure`) nie zadziałają.

```bash
mkdir -p ~/docker/tatoo_gallery
# sieć, w której działa NPM -> wpisz jej nazwę w .env jako PROXY_NETWORK:
docker inspect $(docker ps --filter name=nginx-proxy-manager -q | head -1) \
  --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}'
cd ~/docker/tatoo_gallery
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

## 1. Baza danych

Aplikacja nie uruchamia własnego MySQL – korzysta ze **wspólnej instancji** serwera (patrz
[docs/DB-CONSOLIDATION.md](docs/DB-CONSOLIDATION.md)). W `.env` na serwerze podaj `DB_HOST` (nazwa kontenera
MySQL), `DB_NETWORK` (wspólna sieć Dockera) oraz dane bazy `tattoogallery` i jej użytkownika.

## 1a. Nginx Proxy Manager

Po pierwszym deployu (kontener `tattoogallery_app` musi działać) dodaj w NPM **Proxy Host**:

| Pole | Wartość |
|---|---|
| Domain Names | `tatoo.asapcreative.agency` |
| Scheme | `http` |
| Forward Hostname / IP | `tattoogallery_app` |
| Forward Port | `3000` |
| Block Common Exploits | włączone |
| Websockets Support | opcjonalnie |

Zakładka **SSL**: *Request a new SSL Certificate* (Let's Encrypt), *Force SSL*, *HTTP/2*. Rekord DNS `A`
musi już wskazywać na serwer (jeśli domena jest za proxy CDN, wyłącz je na czas wystawiania certyfikatu).

Zakładka **Advanced** (wklej obowiązkowo, inaczej wgrywanie zdjęć kończy się błędem 413):

```nginx
client_max_body_size 35m;
proxy_read_timeout 120s;
proxy_send_timeout 120s;
```

NPM musi być w tej samej sieci Dockera co aplikacja (`PROXY_NETWORK`), inaczej nie rozwiąże nazwy
`tattoogallery_app`. Alternatywa: w polu Forward Hostname użyj IP kontenera (niestabilne po restarcie).

## 2. Sekrety GitHub (repo `JaroslawAugustyniak/tatoo_galery_pwa` → Settings → Secrets and variables → Actions)

Zalecane: environment **production** (Settings → Environments), opcjonalnie z wymaganą akceptacją.

| Nazwa | Typ | Wartość |
|---|---|---|
| `SSH_HOST` | secret | adres serwera |
| `SSH_USER` | secret | użytkownik deployu |
| `SSH_PRIVATE_KEY` | secret | zawartość `deploy_key` |
| `SSH_KNOWN_HOSTS` | secret | wynik `ssh-keyscan` |
| `SSH_PORT` | secret (opcj.) | domyślnie 22 |
| `GHCR_PULL_TOKEN` | secret (opcj.) | PAT (classic) z `read:packages`, jeśli pakiet w GHCR jest prywatny |
| `DEPLOY_PATH` | variable (opcj.) | domyślnie `docker/tatoo_gallery` (względem katalogu domowego) |

Pakiet w GHCR jest domyślnie prywatny: albo podaj `GHCR_PULL_TOKEN`, albo po pierwszym buildzie ustaw
widoczność pakietu na publiczną (Packages → ustawienia pakietu).

## 3. Pierwszy deploy

`git push origin main` (lub Actions → CI/CD → Run workflow). Po sukcesie galeria działa pod
`https://tatoo.asapcreative.agency`, a panel pod `/admin`. Pierwsze konto zakłada się przez rejestrację (kod 2FA przyjdzie
mailem przez Resend – dlatego klucz Resend i zweryfikowana domena nadawcy są wymagane w `.env`).

## 4. Operacje

```bash
cd ~/docker/tatoo_gallery
alias dc='docker compose --env-file .env --env-file image.env -f docker-compose.server.yml'
dc ps && dc logs -f tattoogallery-web

# Rollback: wskaż poprzedni obraz (tag = SHA commita z GHCR)
echo 'IMAGE_REF=ghcr.io/<owner>/<repo>:<poprzedni-sha>' > image.env && dc up -d tattoogallery-web
```

Migracje wykonują się tylko „do przodu”. Rollback do obrazu ze starszym schematem bazy wymaga ręcznego
przywrócenia kopii bazy.

### Kopie zapasowe

Baza jest we wspólnej instancji MySQL – jej kopie opisuje [docs/DB-CONSOLIDATION.md](infra/mysql/backup.sh).
Zdjęcia (wolumen uploadów tej aplikacji):

```bash
docker run --rm -v tattoogallery_tattoogallery_uploads:/data -v "$PWD":/out alpine \
  tar czf /out/backup-uploads-$(date +%F).tgz -C /data .
```

## 5. Współdzielony serwer – zasady bezpieczeństwa

- Projekt Compose ma stałą nazwę `tattoogallery`; workflow nie używa `--remove-orphans` ani `docker image prune`
  (działałyby poza tym projektem).
- Serwis nazywa się `tattoogallery-web`, bo nazwa serwisu to alias DNS w sieci NPM – nazwa `app` mogłaby
  kolidować z innymi projektami. W NPM kieruj ruch na **nazwę kontenera** `tattoogallery_app`.
- Kontener aplikacji ma limit pamięci (`APP_MEM_LIMIT`, domyślnie 768m).
- Awaryjne zatrzymanie tylko tej aplikacji: `dc down` (nie usuwa wolumenów).

## 6. Uwagi

- Subdomeny tatuatorów (`slug.domena`) nie są włączone: galerie działają pod `/t/slug`. Włączenie wymaga
  wildcard DNS i certyfikatu wildcard (DNS-01) oraz osobny Proxy Host z `*.domena`.
- `docker-compose.yml` to środowisko lokalne (kod z bind mounta, `next dev`). Serwer używa wyłącznie
  `docker-compose.server.yml`.
