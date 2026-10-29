<p align="center">
  <img src="brand/anime/thomas-logo-anime.svg" alt="Thomas" width="520">
</p>

# Régie

Régie fabrique mes TikToks « l'histoire derrière la chanson ». Je tape le titre et l'artiste, et je récupère une vidéo verticale montée, avec ma voix, les images et le texte qui s'écrit au rythme de ce que je dis.

Ensuite je relis. Le script s'affiche phrase par phrase, et chaque phrase est un plan de la vidéo. Je clique dessus, l'aperçu saute au bon moment, et je change ce qui ne va pas : l'image, le mot en grand, l'effet d'entrée, le texte. Quand j'exporte à nouveau, seuls les plans modifiés repassent au rendu. Le reste vient du cache.

![Cover](brand/reseaux/github-cover.png)

## Ce que ça fait

1. Claude écrit l'histoire, avec recherche web et sources, puis la découpe en plans.
2. ElevenLabs lit chaque phrase avec ma voix (voice id `AYfOkr1hDQYbhigmRZ16`).
3. Apify va chercher des images sur Pinterest, Deezer donne la pochette.
4. HyperFrames monte chaque plan en 1080×1920, en Kaneda Gothic, fond blanc. ffmpeg colle les plans et pose la voix.

Kaneda Gothic est dans le dépôt (`brand/fonts/kaneda/`, voir son README). Ce n'est pas une police libre : garde le dépôt privé. L'app, elle, reste en Oswald.

Corriger un plan ne relance pas tout. Changer une image, un effet ou le mot en grand ne coûte rien : aucun appel à un modèle. Changer le texte refait la voix de cette phrase seulement. Une consigne à Claude (« @b08 une photo plus vieille ») n'envoie que la phrase et ses deux voisines, pas tout le script.

## Les écrans

- **Quelle chanson ?** : l'écran d'accueil, pensé pour le téléphone. Titre, artiste, un angle si j'en ai un, et c'est parti.
- **Le Fil** : le script est l'interface. À gauche les phrases, à droite l'aperçu en direct dans un cadre de téléphone et ce que la vidéo a coûté. En bas, la barre de correction (touche `/`). Les flèches haut et bas passent d'une phrase à l'autre. « Annuler » revient à l'état d'avant, à chaque fois.

## Lancer en local

Il faut Node 22, pnpm 10, Postgres 16 et ffmpeg.

```bash
pnpm install
cp .env.example .env        # puis remplis SESSION_SECRET et MEDIA_SECRET (openssl rand -base64 48)
pnpm db:migrate
pnpm dev                    # l'app sur http://localhost:3000 et le worker
```

Avec `DEV_LOGIN=1` dans `.env`, la page de connexion propose « Entrer en local ». Sans clés, chaque service tourne en mode démo : voix muette, images en dégradé, script d'exemple. Ça suffit pour essayer tout le parcours.

Avec Docker : `docker compose up --build`.

## Les clés

Elles vont dans les variables d'environnement du serveur, et nulle part ailleurs. Jamais dans le code, jamais dans le navigateur.

| Variable | Sert à |
| --- | --- |
| `ANTHROPIC_API_KEY` | écrire et retoucher le script (modèle `claude-opus-5-5` par défaut, changeable avec `CLAUDE_MODEL`) |
| `ELEVENLABS_API_KEY` | la voix |
| `APIFY_TOKEN` | les images Pinterest |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | la connexion, obligatoire en production |
| `BUDGET_DAY_USD`, `BUDGET_VIDEO_USD` | les plafonds de dépense (5 $ par jour, 2 $ par vidéo par défaut) |

Pour l'app OAuth GitHub, l'URL de callback est `https://ton-domaine/auth/github/callback`.

L'acteur Pinterest reçoit `searchQueries` et `maxPins` (6 épingles par recherche). Sans `maxPins`, il en facture 50.

## Sécurité

- Une seule personne entre : le compte GitHub `OWNER_GITHUB_LOGIN`. La session est un jeton signé dans un cookie httpOnly.
- Chaque route vérifie la session, et toute modification doit venir de l'app elle-même (contrôle de l'origine).
- Les entrées sont validées avec zod, avec des tailles maximales.
- L'aperçu tourne dans un cadre isolé, sans origine : il ne voit ni les cookies ni l'API. Les images, la voix et les MP4 passent par des liens signés qui expirent.
- Les images ne sont téléchargées que depuis Pinterest et Deezer, en HTTPS, avec une taille maximale, puis ré-encodées avant usage.
- Content-Security-Policy avec nonce, HSTS, pas d'iframe externe.
- Les clés restent côté worker. L'app web ne fait que mettre des tâches en file.

Le détail est dans [SECURITY.md](SECURITY.md).

## Organisation

```
apps/web         l'app Next.js (écrans, API, aperçu)
apps/worker      Claude, voix, images, rendu HyperFrames
packages/core    le modèle d'une vidéo, le minutage et la composition HTML
packages/db      Postgres (drizzle) : vidéos, versions, fichiers, coûts
packages/server  configuration, stockage, liens signés, file de tâches, budget
brand            logo, version animée, icônes, aperçus réseaux, police Oswald
```

## La marque

Le logo s'appelle « Le Sillon » : THOMAS en Oswald, avec le O en vinyle. Tout est dans `brand/` :

- `logo/` : le logo en SVG et PNG, sur fond clair et sombre, et l'avatar TikTok.
- `anime/` : la version animée (SVG, MP4, GIF) et la boucle.
- `icones/` : favicons, icônes d'app, icône masquable.
- `reseaux/` : les aperçus de lien (1200×630) et la cover GitHub.
- `fonts/` : Oswald, sous licence SIL Open Font License.

`node brand/scripts/build-brand.mjs` régénère les PNG, le MP4 et le GIF.
