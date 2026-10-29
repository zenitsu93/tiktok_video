# Régie en ligne

Régie tourne sur le VPS OVH (15.235.241.90), à l'adresse https://regie.2nbdigital.com.

## Comment une mise à jour arrive en ligne

1. Je fusionne sur `main`.
2. La CI (`.github/workflows/ci.yml`) vérifie les types, lance les tests et le build, puis construit l'image Docker et la publie sur `ghcr.io/zenitsu93/tiktok_video`. L'image est privée, comme le dépôt.
3. Le job « Déploiement (VPS) » se connecte au VPS en SSH. Sa clé ne peut lancer que `deploy/deploy.sh` : le script récupère le commit, tire l'image, relance la pile et attend que l'app réponde. Le jeton GitHub qui sert à tirer l'image expire avec le job. Rien n'en reste sur le serveur.
4. La CI vérifie que https://regie.2nbdigital.com/login répond.

Pour redéployer sans rien changer : onglet Actions, workflow « CI », « Run workflow » sur `main`.
Pour revenir à une version : relancer le job d'un ancien commit (« Re-run jobs »).

## Ce qu'il y a sur le VPS

- `~/regie` : le dépôt, cloné avec une clé en lecture seule (`~/.ssh/github_regie`, hôte `github-regie`).
- `~/regie/.env` : les clés de l'app (droits 600). Le modèle est `.env.example`.
- `~/regie/deploy/.env` : le mot de passe de Postgres, et `REGIE_TAG`, la version en ligne, que tient `deploy.sh`.
- Trois conteneurs : `regie-web` (Next.js), `regie-worker` (Claude, voix, images, rendu) et `regie-db` (Postgres 16).
- Deux volumes : `regie-pgdata` pour la base et `regie-media` pour les images, les voix et les MP4.
- `~/caddy-sites/regie.caddy`, copié depuis `deploy/regie.caddy`. Le Caddy de 2nb-prospect sert le site en HTTPS et joint `regie-web` par le réseau `2nb-prospect_frontend`.

Le VPS a 2 cœurs et 4 Go de mémoire, partagés avec les autres sites. Le worker rend donc un plan à la fois, avec un seul Chrome, et il est borné à 1,5 Go et 1,5 cœur. Un export prend plus de temps qu'en local, mais il ne gêne personne.

## Le DNS

L'enregistrement A `regie` → `15.235.241.90` est dans la zone `2nbdigital.com` chez o2switch (cPanel du compte `bach7935`, « Zone Editor »).

## Commandes utiles sur le VPS

```bash
cd ~/regie
docker compose -f deploy/docker-compose.yml ps
docker compose -f deploy/docker-compose.yml logs -f --tail 100 worker
docker compose -f deploy/docker-compose.yml up -d   # après une modification de .env
```

## Changer une clé

Je modifie `~/regie/.env` sur le VPS, puis `docker compose -f deploy/docker-compose.yml up -d` recrée `web` et `worker` avec les nouvelles valeurs (`restart` ne relit pas le fichier). Aucun secret ne passe par GitHub, sauf la clé SSH de déploiement.
