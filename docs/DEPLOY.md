# Put Élysée Chauffeur online

GitHub keeps the code, runs the tests and builds the Docker images. A server of yours runs them.

```
push to main ──► GitHub Actions: tests ──► images on ghcr.io ──► (Deploy button) ──► your server
                                                                                       Caddy (HTTPS)
                                                                                       └─ website + API
                                                                                       └─ PostgreSQL
```

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

```bash
docker compose exec -T postgres pg_dump -U taxi taxi | gzip > backup-$(date +%F).sql.gz
```

Copy the file off the server regularly (a daily `cron` job is enough).

## Phone apps

The phone apps are not built by GitHub Actions: use Expo's EAS (`npx eas-cli build`, free tier), with `EXPO_PUBLIC_API_URL=https://book.your-domain.com` in `apps/mobile/eas.json`. See the README.
