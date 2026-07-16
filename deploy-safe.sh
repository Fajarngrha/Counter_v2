#!/usr/bin/env bash
set -Eeuo pipefail

# Safe deploy script:
# - backup data runtime lokal
# - update code dari GitHub
# - kembalikan data runtime terakhir
# - restart service
#
# Usage:
#   ./deploy-safe.sh [branch]
# Example:
#   ./deploy-safe.sh main
#
# Optional env:
#   SERVICE_NAME=iot-counter
#   BACKUP_ROOT=~/counter-backup
#   SKIP_NPM=1

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BRANCH="${1:-main}"
SERVICE_NAME="${SERVICE_NAME:-iot-counter}"
BACKUP_ROOT="${BACKUP_ROOT:-$HOME/counter-backup}"
DATA_DIR="$APP_DIR/data"
BACKUP_DIR="$BACKUP_ROOT/$(date +%F_%H%M%S)"

DATA_FILES=(
  "db.json"
  "shift-config.json"
)

SUDO_CMD=""
if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
  SUDO_CMD="sudo"
fi

log() {
  echo "[deploy-safe] $*"
}

warn() {
  echo "[deploy-safe][WARN] $*" >&2
}

restore_data() {
  mkdir -p "$DATA_DIR"
  for file in "${DATA_FILES[@]}"; do
    if [[ -f "$BACKUP_DIR/$file" ]]; then
      cp -a "$BACKUP_DIR/$file" "$DATA_DIR/$file"
      log "Restore data: $file"
    else
      warn "Backup untuk $file tidak ditemukan, skip restore."
    fi
  done
}

start_service_if_exists() {
  if command -v systemctl >/dev/null 2>&1; then
    $SUDO_CMD systemctl start "$SERVICE_NAME"
    $SUDO_CMD systemctl status "$SERVICE_NAME" --no-pager -l || true
  else
    warn "systemctl tidak ditemukan, skip start service otomatis."
  fi
}

on_error() {
  warn "Terjadi error. Coba rollback data runtime dari backup terakhir..."
  restore_data
  start_service_if_exists
  warn "Rollback selesai. Periksa log error di atas."
}

trap on_error ERR

if ! command -v git >/dev/null 2>&1; then
  echo "Error: git tidak ditemukan." >&2
  exit 1
fi

cd "$APP_DIR"

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Error: $APP_DIR bukan git repository." >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR" "$DATA_DIR"
for file in "${DATA_FILES[@]}"; do
  if [[ -f "$DATA_DIR/$file" ]]; then
    cp -a "$DATA_DIR/$file" "$BACKUP_DIR/$file"
    log "Backup data: $file"
  else
    warn "File data tidak ada: $DATA_DIR/$file"
  fi
done
log "Backup tersimpan di: $BACKUP_DIR"

if command -v systemctl >/dev/null 2>&1; then
  log "Stop service: $SERVICE_NAME"
  $SUDO_CMD systemctl stop "$SERVICE_NAME"
else
  warn "systemctl tidak ditemukan, skip stop service otomatis."
fi

log "Git fetch origin"
git fetch origin

log "Git pull --rebase origin $BRANCH"
git pull --rebase origin "$BRANCH"

log "Restore data runtime terbaru sebelum patch"
restore_data

if [[ "${SKIP_NPM:-0}" != "1" ]]; then
  if command -v npm >/dev/null 2>&1; then
    if [[ -f "$APP_DIR/package-lock.json" ]]; then
      log "Install dependencies: npm ci --omit=dev"
      npm ci --omit=dev
    elif [[ -f "$APP_DIR/package.json" ]]; then
      log "Install dependencies: npm install --omit=dev"
      npm install --omit=dev
    else
      warn "package.json tidak ditemukan, skip npm install."
    fi
  else
    warn "npm tidak ditemukan, skip install dependencies."
  fi
else
  log "SKIP_NPM=1, lewati install dependencies."
fi

start_service_if_exists

log "Deploy selesai. Data runtime tetap pakai versi backup terakhir."
log "Lokasi backup: $BACKUP_DIR"
