#!/bin/sh
# Mise à jour du serveur, lancée par la CI après chaque push sur main.
# La clé SSH de la CI ne peut lancer que ce script (authorized_keys :
# command="/home/christian/regie/deploy/deploy.sh",restrict). La CI passe le commit à déployer
# comme commande SSH et, sur l'entrée standard, son jeton GitHub, qui expire avec le job :
# il sert seulement à tirer l'image privée sur ghcr.io, rien n'en reste sur le serveur.
set -eu

IMAGE=ghcr.io/zenitsu93/tiktok_video

main() {
	cd "$(dirname "$0")/.."
	sha="${SSH_ORIGINAL_COMMAND:-${1:-}}"
	case "$sha" in
		"" | *[!0-9a-f]*) sha= ;;
	esac
	[ "${#sha}" -eq 40 ] || { echo "[deploy] Il faut le commit à déployer (40 caractères hexadécimaux)" >&2; exit 1; }

	echo "[deploy] Récupération de ${sha}"
	git fetch --quiet origin main
	git checkout --quiet --detach "$sha"
	git log -1 --format='[deploy] Version %h : %s'

	# Connexion à ghcr.io dans un dossier jetable : le jeton ne touche pas ~/.docker.
	DOCKER_CONFIG="$(mktemp -d)"
	export DOCKER_CONFIG
	trap 'rm -rf "$DOCKER_CONFIG"' EXIT
	docker login ghcr.io --username zenitsu93 --password-stdin >/dev/null

	# deploy/.env garde la version en ligne : un « docker compose up » à la main reprend la même.
	if grep -q '^REGIE_TAG=' deploy/.env; then
		sed -i "s/^REGIE_TAG=.*/REGIE_TAG=${sha}/" deploy/.env
	else
		echo "REGIE_TAG=${sha}" >> deploy/.env
	fi

	compose="docker compose -f deploy/docker-compose.yml"
	$compose pull --quiet web worker
	$compose up -d --remove-orphans --wait --wait-timeout 300

	# Le disque du VPS est compté : seule la version en ligne reste.
	docker images "$IMAGE" --format '{{.Repository}}:{{.Tag}}' | grep -v ":${sha}\$" | xargs -r docker rmi >/dev/null 2>&1 || true
	docker image prune -f >/dev/null

	# Le site Caddy suit le dépôt : recopié et rechargé seulement s'il a changé.
	sites="${CADDY_SITES_DIR:-$HOME/caddy-sites}"
	if ! cmp -s deploy/regie.caddy "$sites/regie.caddy"; then
		cp deploy/regie.caddy "$sites/regie.caddy"
		docker exec 2nb-prospect-caddy-1 caddy reload --config /etc/caddy/Caddyfile
		echo "[deploy] Site Caddy rechargé"
	fi

	$compose ps --format 'table {{.Service}}\t{{.Status}}'
	echo "[deploy] Terminé"
}

main "$@"
