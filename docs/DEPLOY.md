# Put Élysée Chauffeur online

GitHub keeps the code, runs the tests and builds the Docker images. A server of yours runs them.

```
push to main ──► GitHub Actions: tests ──► images on ghcr.io ──► (Deploy button) ──► your server
                                                                                       Caddy (HTTPS)
                                                                                       └─ website + API
                                                                                       └─ PostgreSQL
```

## Fast path (Oracle Cloud free + DuckDNS, about 30 minutes)

1. **Server:** create the free Oracle Cloud machine (see "Oracle Cloud free in detail" below) and download its SSH key.
2. **Free name:** on duckdns.org, sign in with GitHub, choose a name (e.g. `elysee-chauffeur`) and put your server's public IP in it. Your address is `elysee-chauffeur.duckdns.org`.
3. **GitHub token for the server:** GitHub › Settings › Developer settings › Tokens (classic) › Generate, scopes `repo` and `read:packages` only. You type it on the server, once.
4. **From your Mac, in the project folder:**
   ```bash
   scp -i ~/Downloads/<your-key>.key deploy/setup-server.sh ubuntu@<server-ip>:
   ssh -t -i ~/Downloads/<your-key>.key ubuntu@<server-ip> 'bash setup-server.sh'
   ```
   The script installs Docker, opens the ports, downloads the code, creates the settings with fresh random secrets, and starts everything with HTTPS. It asks only for your GitHub user + token, the address (`elysee-chauffeur.duckdns.org`) and, optionally, your email (SMTP) settings.
5. Create your account on the site, make it the owner (the script prints the command), sign in at `/admin`.

The sections below explain each step in detail.

## 1. A server (once)

Any Linux machine with 2 GB of memory or more and Docker:

- **Oracle Cloud "Always Free"** (free, an Arm VM with plenty of memory), or
- a small VPS (Hetzner, OVH, Scaleway…, about 4–6 € a month).

On the server (Ubuntu):

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER   # then log out and back in
```

### Oracle Cloud free (Arm) in detail

1. Sign up at cloud.oracle.com (choose your **home region** carefully: free resources stay there, e.g. Paris or Marseille).
2. **Compute › Instances › Create instance**:
   - Image: **Canonical Ubuntu 24.04**
   - Shape: **Ampere › VM.Standard.A1.Flex**, 2 OCPU and 12 GB memory (inside the free allowance)
   - Networking: keep "assign a public IPv4 address"
   - SSH keys: **Generate a key pair for me** and download the private key (keep it safe; it is your way in)
   - If it says "out of capacity", try another availability domain or try again later.
3. **Open the web ports** (Oracle blocks them twice):
   - In the instance's **Subnet › Security list › Add ingress rules**: source `0.0.0.0/0`, TCP, destination ports `80,443`.
   - On the server itself (Oracle's Ubuntu images have their own firewall rules):
     ```bash
     sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
     sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
     sudo netfilter-persistent save
     ```
4. Connect: `ssh -i <downloaded-key> ubuntu@<public IP>`, then install Docker as above.

The images built by GitHub work on Arm and on Intel/AMD servers alike.

## 2. Your domain (once)

**No domain yet?** Use the free name sslip.io gives every IP address: for `152.67.12.34` it is `152-67-12-34.sslip.io`. Put that in `DOMAIN` below; HTTPS works with it. Switch to your real domain later by changing `DOMAIN` and `SITE_URL` and restarting.

At your domain registrar, point an `A` record (e.g. `book.your-domain.com`, or the domain itself) to the server's IP address. Open ports 80 and 443 in the server's firewall (on Oracle Cloud: also in the "security list" of the network).

## 3. The code and the settings on the server (once)

The repository is private, so the server needs read access:

1. On GitHub: **Settings › Developer settings › Fine-grained tokens › Generate**, for the `driving` repository only, with **Contents: read**, and a **classic token** with only `read:packages` for the images. Type them on the server, never in a chat or a file in the repository.
2. On the server:

```bash
git clone https://github.com/Bedreddine/driving.git ~/driving    # asks for your GitHub user + the contents token
echo "<the read:packages token>" | docker login ghcr.io -u <your GitHub user> --password-stdin
cd ~/driving
cp .env.example .env
nano .env
```

In `.env`, set at least:

| Setting | Value |
|---|---|
| `POSTGRES_PASSWORD` | a long random string (`openssl rand -base64 32`) |
| `JWT_SECRET` | another one (`openssl rand -base64 48`) |
| `DOMAIN` | `book.your-domain.com` (no https://) |
| `SITE_URL` | `https://book.your-domain.com` |
| `GHCR_OWNER` | your GitHub user in lowercase, e.g. `bedreddine` |
| `SMTP_*`, `MAIL_FROM` | your mailbox's SMTP settings, for client emails |

## 4. Start

```bash
docker compose -f docker-compose.yml -f deploy/docker-compose.prod.yml pull
docker compose -f docker-compose.yml -f deploy/docker-compose.prod.yml up -d
```

Open `https://book.your-domain.com`: Caddy gets the HTTPS certificate by itself within a minute.

Make your own account the owner (driver + back office), then sign in at `/admin`:

```bash
docker compose -f docker-compose.yml -f deploy/docker-compose.prod.yml run --rm backend --taxi.make-owner=you@example.com --server.port=0
```

In the back office › Entreprise, set the website address to `https://book.your-domain.com`: the QR code and the emailed links use it.

## 5. Updates

Every push to `main` runs the tests; when they pass, GitHub builds new images. To put them online:

- **On GitHub:** Actions › **Deploy** › Run workflow (after setting the three secrets below), or
- **on the server:** `git pull` then the two commands of step 4.

Secrets for the Deploy button (repository **Settings › Secrets and variables › Actions**):

| Secret | Value |
|---|---|
| `DEPLOY_HOST` | the server's IP or name |
| `DEPLOY_USER` | the Linux user that runs Docker |
| `DEPLOY_SSH_KEY` | a private SSH key made only for this (`ssh-keygen -t ed25519 -f deploy_key`); add `deploy_key.pub` to the server's `~/.ssh/authorized_keys` |

To go back to an earlier version: set `IMAGE_TAG=<commit id>` in `.env` and run step 4 again.

## 6. Backups

The setup script installs a nightly job (03:17) that runs `deploy/backup.sh`: a compressed copy of the database in `~/driving/backups/`, the last 14 days kept, and a line in `backups/backup.log`. Run it by hand any time:

```bash
~/driving/deploy/backup.sh
```

Keep a copy off the server too (from your Mac, once a week for example):

```bash
scp -i <your-key> 'ubuntu@<server-ip>:~/driving/backups/*.sql.gz' ~/Backups/elysee/
```

Restore (into an empty database):

```bash
gunzip -c backups/taxi-2026-10-03.sql.gz | docker compose -f docker-compose.yml -f deploy/docker-compose.prod.yml exec -T postgres psql -U taxi taxi
```

## Phone apps

The phone apps are not built by GitHub Actions: use Expo's EAS (`npx eas-cli build`, free tier), with `EXPO_PUBLIC_API_URL=https://book.your-domain.com` in `apps/mobile/eas.json`. See the README.

## The website on GitHub Pages (optional)

The website alone can be served free by GitHub Pages; the server (API + database) still runs on your machine above.

1. The repository must be **public** for free Pages (Settings › General › Danger zone › Change visibility).
2. **Settings › Pages › Build and deployment › Source: GitHub Actions.**
3. Actions › **Website on GitHub Pages** › Run workflow. The site appears at `https://bedreddine.github.io/driving/`.
4. Once the server is online, connect them:
   - GitHub › Settings › Secrets and variables › Actions › **Variables**: `API_URL` = the server's address (e.g. `https://152-67-12-34.sslip.io`), then run the workflow again.
   - On the server, in `.env`: `EXTRA_CORS_ORIGINS=https://bedreddine.github.io`, and `SITE_URL=https://bedreddine.github.io/driving` so the QR code and the emailed links open the Pages site; restart.

Until `API_URL` is set, the pages open (map, places, language) but prices, bookings and sign-in need the server.
