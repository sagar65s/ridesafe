#!/usr/bin/env bash
set -euo pipefail

if [[ "${ALLOW_DOCKER_DEPLOY:-}" != "true" ]]; then
  echo "Deployment blocked. Review .env.production, then set ALLOW_DOCKER_DEPLOY=true explicitly."
  exit 1
fi

command -v docker >/dev/null 2>&1 || { echo "Docker is required."; exit 1; }
docker compose version >/dev/null
[[ -f .env.production ]] || { echo ".env.production is required."; exit 1; }

docker compose --env-file .env.production config --quiet
docker compose --env-file .env.production up --build -d
docker compose --env-file .env.production ps
