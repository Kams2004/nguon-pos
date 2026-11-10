# Deploying Nguon POS on the shared VPS

The VPS also runs other applications (`nguon-app`, `clinic`, `jitsi-docker`,
`riskyc`). Nguon POS lives in `~/nguon-pos` as its own compose project
(`nguon-pos-*` containers and volumes) and listens on `127.0.0.1:8090` only;
the host nginx terminates HTTPS and forwards to it. Nothing here touches the
other applications.

## First install (as `deploy`)

```bash
git clone https://github.com/Kams2004/nguon-pos.git ~/nguon-pos
cd ~/nguon-pos
cp .env.example .env && chmod 600 .env   # then fill in real secrets, plus:
#   POS_HTTP_BIND=127.0.0.1:8090
#   MINIO_IMAGE=minio/minio:latest
docker compose build auth-service && docker compose build catalog-service \
  && docker compose build sales-service && docker compose build pos-pwa   # one at a time: shared server
docker compose up -d
curl -s http://127.0.0.1:8090/api/sales/actuator/health
```

## Host nginx + certificate (needs sudo)

```bash
sudo cp ~/nguon-pos/deploy/vps/pos.nguonevents.com.conf /etc/nginx/sites-available/pos.nguonevents.com
sudo ln -s /etc/nginx/sites-available/pos.nguonevents.com /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d pos.nguonevents.com
```

## Updating

```bash
cd ~/nguon-pos && git pull
sh deploy/vps/update.sh <service>   # e.g. sales-service pos-pwa; restarts nginx at the end
```

## Backups

`deploy/vps/backup.sh` saves:
- the whole database, every run (14 kept);
- the media library, weekly (4 kept);
- once, the MinIO image (MinIO no longer publishes images, so this copy is the only way to reinstall it).

Install it nightly at 03:15 (user crontab, nothing system-wide):

```bash
(crontab -l 2>/dev/null; echo '15 3 * * * cd $HOME/nguon-pos && sh deploy/vps/backup.sh >> backups/backup.log 2>&1') | crontab -
sh deploy/vps/backup.sh            # a first one now
```

Copy them off the server from your computer: `sh deploy/vps/pull-backups.sh` (into `~/nguon-pos-backups/`).

Check now and then that a backup really restores. This is harmless: it restores into a separate database, compares row counts, then deletes it.

```bash
sh deploy/vps/restore.sh backups/db/<latest>.dump --test
```

In a disaster, `--replace` instead of `--test` puts a dump back as the live data (it asks you to type the database name first). Tills resend whatever they hold that the dump lacks.

To reinstall MinIO on a new server: `docker load < backups/images/minio-image.tar.gz`.
