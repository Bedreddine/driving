#!/usr/bin/env bash
# One-time setup of a fresh Ubuntu server (Oracle Cloud free, or any VPS) for Élysée Chauffeur:
# Docker, the web ports, the code, the settings with fresh random secrets, and the first start with HTTPS.
#
# From your Mac (the repository is private, so copy the script over SSH):
#   scp -i <your-key> deploy/setup-server.sh ubuntu@<server-ip>:
#   ssh -i <your-key> ubuntu@<server-ip> 'bash setup-server.sh'
#
# Safe to run again: it keeps an existing .env and only updates and restarts.
set -euo pipefail

REPO="https://github.com/Bedreddine/driving.git"
DIR="$HOME/driving"
COMPOSE=(docker compose -f docker-compose.yml -f deploy/docker-compose.prod.yml)

say() { printf '\n\033[1;33m▸ %s\033[0m\n' "$*"; }
ask() { local v; read -r -p "$1: " v; printf '%s' "$v"; }
# Single-quoted for .env (read by both Docker Compose and bash): any character is safe.
quote() { printf "'%s'" "$(printf '%s' "$1" | sed "s/'/'\\\\''/g")"; }
ask_secret() { local v; read -r -s -p "$1: " v; echo >&2; printf '%s' "$v"; }

# ---------------------------------------------------------------- Docker
if ! command -v docker >/dev/null 2>&1; then
  say "Installing Docker"
  curl -fsSL https://get.docker.com | sudo sh
  sudo usermod -aG docker "$USER"
fi
# Use sudo for docker until the next login picks up the docker group.
if ! docker info >/dev/null 2>&1; then COMPOSE=(sudo "${COMPOSE[@]}"); DOCKER=(sudo docker); else DOCKER=(docker); fi

# ---------------------------------------------------------------- Web ports
say "Opening ports 80 and 443 on this machine"
if command -v iptables >/dev/null 2>&1 && sudo iptables -S INPUT 2>/dev/null | grep -q REJECT; then
  # Oracle Cloud's Ubuntu images reject everything but SSH by default.
  for port in 80 443; do
    sudo iptables -C INPUT -p tcp --dport "$port" -m state --state NEW -j ACCEPT 2>/dev/null \
      || sudo iptables -I INPUT 6 -p tcp --dport "$port" -m state --state NEW -j ACCEPT
  done
  sudo iptables -C INPUT -p udp --dport 443 -j ACCEPT 2>/dev/null || sudo iptables -I INPUT 6 -p udp --dport 443 -j ACCEPT
  command -v netfilter-persistent >/dev/null 2>&1 && sudo netfilter-persistent save >/dev/null
fi
command -v ufw >/dev/null 2>&1 && sudo ufw status | grep -q active && { sudo ufw allow 80/tcp; sudo ufw allow 443; } || true
echo "On Oracle Cloud, also add ports 80 and 443 to the subnet's security list (see docs/DEPLOY.md)."

# ---------------------------------------------------------------- GitHub access (private repository)
GH_USER=""
GH_TOKEN=""
if [ ! -d "$DIR/.git" ] || ! "${DOCKER[@]}" pull -q "ghcr.io/$(echo "${GHCR_OWNER:-bedreddine}" | tr 'A-Z' 'a-z')/driving-web:latest" >/dev/null 2>&1; then
  say "GitHub access (typed here only, never saved in the code)"
  echo "Create a classic token on GitHub with only the scopes 'repo' (read the code) and 'read:packages' (read the images)."
  GH_USER=$(ask "Your GitHub user name")
  GH_TOKEN=$(ask_secret "The token (hidden)")
  printf '%s' "$GH_TOKEN" | "${DOCKER[@]}" login ghcr.io -u "$GH_USER" --password-stdin
fi

# ---------------------------------------------------------------- Code
if [ -d "$DIR/.git" ]; then
  say "Updating the code"
  git -C "$DIR" pull --ff-only
else
  say "Downloading the code"
  # The token is passed for this one command only; the saved remote stays plain.
  git -c "http.extraHeader=Authorization: Basic $(printf '%s:%s' "$GH_USER" "$GH_TOKEN" | base64 | tr -d '\n')" clone -q "$REPO" "$DIR"
fi
cd "$DIR"

# ---------------------------------------------------------------- Settings
if [ ! -f .env ]; then
  say "Settings"
  IP=$(curl -fsS https://api.ipify.org || true)
  echo "Your server's public IP: ${IP:-unknown}"
  echo "Website address without https:// — your DuckDNS name (e.g. elysee-chauffeur.duckdns.org),"
  echo "your own domain, or the free ${IP//./-}.sslip.io"
  DOMAIN=$(ask "Address")
  [ -z "$DOMAIN" ] && DOMAIN="${IP//./-}.sslip.io"
  OWNER=$(echo "${GH_USER:-bedreddine}" | tr 'A-Z' 'a-z')
  echo "Client emails need an SMTP server (your mailbox provider's settings). Leave empty to set it later."
  SMTP_HOST=$(ask "SMTP host (e.g. ssl0.ovh.net, smtp.gmail.com)")
  SMTP_USERNAME=""; SMTP_PASSWORD=""; MAIL_FROM="no-reply@$DOMAIN"
  if [ -n "$SMTP_HOST" ]; then
    SMTP_USERNAME=$(ask "SMTP user name")
    SMTP_PASSWORD=$(ask_secret "SMTP password (hidden)")
    MAIL_FROM=$(ask "Sender address (e.g. contact@your-domain)")
  fi
  umask 077
  cat > .env <<EOF
POSTGRES_PASSWORD=$(openssl rand -hex 24)
JWT_SECRET=$(openssl rand -base64 48 | tr -d '\n')
DOMAIN=$DOMAIN
SITE_URL=https://$DOMAIN
GHCR_OWNER=$OWNER
IMAGE_TAG=latest
SMTP_HOST=$SMTP_HOST
SMTP_PORT=587
SMTP_USERNAME=$(quote "$SMTP_USERNAME")
SMTP_PASSWORD=$(quote "$SMTP_PASSWORD")
MAIL_FROM=$MAIL_FROM
MAIL_REPLY_TO=
PUSH_ENABLED=true
SMS_ENABLED=false
EOF
  echo "Saved in $DIR/.env (readable only by you). Fresh random database password and login secret generated."
fi
set -a; . ./.env; set +a

# ---------------------------------------------------------------- Start
say "Starting (database, server, website, HTTPS)"
"${COMPOSE[@]}" pull
"${COMPOSE[@]}" up -d --no-build --remove-orphans

say "Nightly database backup (03:17, the last 14 days kept in $DIR/backups)"
chmod +x deploy/backup.sh
( crontab -l 2>/dev/null | grep -v 'deploy/backup.sh' ; echo "17 3 * * * $DIR/deploy/backup.sh >> $DIR/backups/backup.log 2>&1" ) | crontab -
mkdir -p backups && chmod 700 backups

say "Waiting for the server"
for _ in $(seq 1 60); do
  if curl -fsS -o /dev/null "https://$DOMAIN/api/public/business" 2>/dev/null; then OK=1; break; fi
  sleep 5
done

if [ "${OK:-}" = 1 ]; then
  say "Online: https://$DOMAIN"
else
  say "Started, but https://$DOMAIN does not answer yet."
  echo "Check: the name points to this server's IP, ports 80/443 are open (Oracle security list), then:"
  echo "  cd $DIR && ${COMPOSE[*]} logs --tail 50 caddy backend"
fi
cat <<EOF

Next:
  1. Create your account on https://$DOMAIN (Sign in › Create account).
  2. Make it the owner (driver + back office):
       cd $DIR && ${COMPOSE[*]} run --rm backend --taxi.make-owner=YOUR@EMAIL --server.port=0
  3. Sign in, open https://$DOMAIN/admin: set prices, hours, your car, and in Entreprise the website address https://$DOMAIN.
Backups: every night in $DIR/backups (copy them off the server from time to time, e.g. scp to your Mac).
Updates later: run this script again, or use the Deploy button on GitHub.
EOF
