---
name: histoire-chanson-thomas
description: Écrit le script voix off d'un TikTok « l'histoire derrière une chanson » dans la voix de @thomasthbdl, le passe au humanizer et prépare les images Pinterest de chaque passage, avant le montage avec montage-tiktok-thomas.
---

# Écrire l'histoire d'une chanson, voix @thomasthbdl

Ce skill écrit le texte que Thomas lit en voix off pour sa série « Je raconte l'histoire derrière vos chansons préférées ». Il a été construit à partir des transcriptions de 25 de ses vidéos. Il produit trois choses : le script, un découpage par passage avec les mots à mettre en valeur à l'écran, et la liste des images à trouver. Le montage se fait ensuite avec le skill `montage-tiktok-thomas`.

## 1. Trouver et vérifier l'histoire

- Cherche une anecdote **précise et peu connue** sur la chanson : une scène de coulisse, un objet, un lieu, une date, une personne inattendue. Exemples de Thomas : une bataille de ballons d'eau avant d'écrire *Speechless*, un flipper et une cassette pour *Liberian Girl*, un paravent tombé sur la tête de Michael pendant *Dangerous*, les lumières éteintes en studio pour *The Lady in My Life*, la princesse Stéphanie cachée sous un pseudonyme dans *In the Closet*.
- Vérifie chaque fait (date, nom, album) sur au moins deux sources sérieuses. Thomas est prudent : ce qui n'est pas confirmé passe **au conditionnel ou avec une source** (« Michael aurait raconté que… », « On raconte aussi que… », « Selon Teddy Riley… », « d'après les sources disponibles », « ces anecdotes restent des récits de coulisse, jamais confirmés officiellement »). N'invente jamais un fait pour rendre l'histoire plus forte.
- Donne à Thomas la liste des sources à la fin, hors script.

## 2. La forme du script

- **Longueur : 130 à 230 mots** (50 à 95 s lus). Phrases courtes, faites pour être dites à voix haute. On tutoie le spectateur (« tu »), parfois « vous » dans l'accroche.
- **Structure** (l'ordre de presque toutes ses vidéos) :
  1. **Accroche (1 à 2 phrases)**, voir la liste ci-dessous.
  2. **Appel à l'abonnement**, formule fixe : « Je raconte l'histoire derrière vos chansons préférées, alors abonne-toi pour la suite, ça me soutient énormément. » Dans les vidéos récentes elle vient **juste après une accroche très courte**, et l'histoire repart avec « Mais au fait, tu connais l'histoire de… ». Dans les plus anciennes, elle est à la toute fin. Par défaut, mets-la au début (format récent).
  3. **Le contexte en une phrase, avec une date et un nom** : « En 2001, le producteur Teddy Riley travaille sur… », « Le 6 juin 1990… », « Fin des années 90… ».
  4. **La scène**, avec des détails concrets qu'on peut illustrer (un lieu, un objet, un geste).
  5. **Le retournement**, introduit par une de ses charnières : « Ce qui est fou, c'est que… », « Et c'est là que… », « Pourtant… », « Le lendemain, le choc : … », « Sauf que… », « Mais ce qui est étonnant… ».
  6. **Le sens émotionnel** : ce que l'anecdote dit de l'artiste ou de nous (« C'est ce contraste entre la superstar planétaire et le père protecteur qui fait toute la force de… »).
  7. **La chute**, une phrase courte qui claque (« C'est un instant de bonheur transformé en musique. », « Un monstre de talent. »), ou une question au spectateur (« Tu connaissais cette histoire ? »).

### Les accroches de Thomas (varier d'une vidéo à l'autre)

| Type | Exemple tiré de ses vidéos |
| --- | --- |
| Question directe | « Tu connais l'histoire de *Speechless* de Michael Jackson ? » |
| Détail sonore précis | « Tu sais ce que j'entends à la troisième seconde de *Liberian Girl* ? » |
| Tu connais… mais tu ignores | « Tu connais par cœur le cri déchirant de cette chanson, mais tu ignores peut-être que… » |
| Casser une idée reçue | « Tu penses que Michael Jackson cherchait la perfection absolue sur chaque note ? La réalité est bien plus touchante. » / « Tu t'es complètement trompé sur cette chanson. » |
| Révélation en une phrase | « La voix la plus sensuelle cachée sur cet album n'appartient pas à une chanteuse professionnelle, mais à une princesse européenne. » |
| Choc daté | « 3 semaines seulement après la mort de Michael Jackson, une fuite mystérieuse… » |
| Scène à imaginer | « Imagine un père qui rentre chez lui. Sa petite fille de 6 ans est en larmes… » |
| Observation perso | « Vous voyez ce mouvement d'épaule au début de *Dirty Diana* ? Je ne sais pas pourquoi, mais il m'a toujours fasciné. » |
| Actu | « T'as vu le nouveau clip de *Human Nature* ? Franchement ! » |

### Les mots qui captent (son vocabulaire réel)

- Intensité : « ultra romantique », « hyper dansant », « complètement dingue », « criminellement sous-coté », « un monstre de talent », « une pépite ».
- Mystère : « caché », « en secret », « l'histoire secrète », « le mystère », « dans l'ombre », « personne ne le savait ».
- Émotion : « déchirant », « bouleversant », « touchant », « fragile », « frisson », « solitude », « intime ».
- Oral : « Ce qui est fou », « Franchement », « en mode », « le truc est devenu un hit mondial », « chelou » (avec parcimonie, sur les sujets légers).
- Surnoms : « le roi de la pop ».
- Pas plus de deux intensifs (« ultra », « complètement », « hyper ») par script : ils marchent parce qu'ils sont rares.

## 3. Passage au humanizer

Une fois le script écrit, applique le skill `humanizer` (installé avec `npx skills add blader/humanizer`) pour retirer les tics d'IA : triades forcées, tirets partout, phrases qui annoncent au lieu de dire, mots gonflés (« emblématique », « véritable », « incontournable »), conclusions qui répètent l'idée. Garde le fond, ne rajoute aucun fait.

Deux exceptions, parce qu'elles font partie de la voix de Thomas :
- la formule fixe de l'appel à l'abonnement, qu'on ne touche pas ;
- **une seule** construction « Ce n'est pas juste une chanson, c'est… » par script, en chute. Le humanizer la signale (« pas X mais Y ») : garde-la si c'est la chute, retire les autres.

Relis ensuite à voix haute (dans ta tête, au rythme de 2,5 mots par seconde) : chaque phrase doit pouvoir se dire d'un souffle.

## 4. Découpage pour le montage

Rends un tableau, un passage par ligne (un passage = 2 à 6 mots, une idée affichée à l'écran) :

| # | Texte dit | Mot héros (gros, en Black) | Image à trouver | Recherche Pinterest |
| --- | --- | --- | --- | --- |
| 1 | tu connais l'histoire de ce son | — | platine vinyle (asset récurrent) | — |
| 7 | une balade ultra romantique | romantique | couple sous un cœur, peinture | `romantic couple heart painting aesthetic` |
| 12 | en environ 45 minutes | 45 | — (texte seul sur blanc) | — |

Règles pour les images :
- **Une image toutes les 1 à 3 secondes**. Environ un passage sur quatre reste sans image : le texte seul sur fond blanc fait partie du style, pour les chiffres et les dates surtout.
- Mélange : photos réelles de l'artiste et des personnes citées (époque exacte), pochettes, extraits de clips, **illustrations peintes ou dessinées** pour les idées abstraites (émotion, voix, amour, solitude), un ou deux **mèmes de réaction** pour l'ironie, des **illustrations au trait** sur fond blanc pour les objets (oreille, micro, platine).
- Recherches Pinterest en anglais, précises : nom + année + scène + `aesthetic` / `painting` / `line art` / `png` selon le rendu voulu. Donne 2 recherches par image.
- Si tu as accès au web (navigateur de Thomas, session sur son ordinateur), fais la recherche toi-même, prends l'image la plus nette et la plus proche du sens, au moins 700 px de large, sans filigrane visible, et enregistre-la dans `assets/img/` sous le nom `NN-motcle.jpg` (NN = numéro du passage). Sinon, donne le tableau à Thomas pour qu'il télécharge les images avec ces noms.

## 5. Ce que tu livres

1. Le script final (après humanizer), prêt à être lu.
2. Le tableau de découpage.
3. Les sources des faits.

Après l'enregistrement de la voix off, le skill `montage-tiktok-thomas` prend la voix, les images `assets/img/NN-*` et le tableau (mots héros) pour faire le montage.
