# Sécurité

## Signaler un problème

Écris-moi en privé sur GitHub (@zenitsu93) plutôt que d'ouvrir une issue publique.

## Ce qui est en place

**Accès.** La connexion passe par GitHub OAuth (avec un `state` vérifié). Seul le compte `OWNER_GITHUB_LOGIN` est accepté. Le jeton GitHub ne sert qu'à lire le login et n'est pas gardé. La session est un JWT HS256 signé avec `SESSION_SECRET`, dans un cookie `httpOnly`, `SameSite=Lax`, `Secure` en production. Le proxy Next.js refuse toute requête sans session, et chaque route revérifie. `DEV_LOGIN=1` est refusé au démarrage en production.

**Requêtes.** Les routes qui modifient quelque chose exigent un en-tête `Origin` égal à l'app. Les corps JSON sont limités en taille et validés par zod, champs inconnus refusés. Les identifiants de vidéo et de plan sont vérifiés par motif.

**Aperçu.** Le document d'aperçu est servi avec `Content-Security-Policy: sandbox allow-scripts` et chargé dans une iframe `sandbox="allow-scripts"`. Il n'a pas d'origine, donc pas accès aux cookies, au stockage ni à l'API. Il ne parle à la page que par `postMessage`, et la page ne lit que les messages de cette iframe.

**Fichiers.** Les médias sont servis par `/api/media/{id}` avec une signature HMAC (`MEDIA_SECRET`) et une date d'expiration, comparées en temps constant. Les clés de stockage sont vérifiées pour ne jamais sortir du dossier. Les images externes ne viennent que d'une liste de domaines, en HTTPS, sans suivre de redirection, 15 Mo au plus, et sont décodées puis ré-encodées par sharp (métadonnées retirées).

**Secrets.** Toutes les clés sont lues depuis l'environnement. `.env` est ignoré par git. Le navigateur ne reçoit jamais une clé ni un chemin de stockage. ffmpeg et HyperFrames sont lancés sans shell, avec des arguments en liste.

**Dépenses.** Chaque appel payant est noté avec son coût. Au-delà de `BUDGET_DAY_USD` par jour ou `BUDGET_VIDEO_USD` par vidéo, le worker refuse et l'app l'affiche.

**En-têtes.** CSP avec nonce, `frame-ancestors 'none'`, `X-Frame-Options: DENY`, HSTS, `nosniff`, `Referrer-Policy: same-origin`, `Permissions-Policy` restrictive.
