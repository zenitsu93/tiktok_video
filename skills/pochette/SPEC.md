# Couverture, intro et sortie « Pochette » (générique, toutes chansons)

## Couverture « bac à disques » (ouverture par défaut, `--opening cover`)
Frame 0 complète, utilisable comme cover TikTok ; la dernière image est identique (boucle).
- Pochette 600×600 à left 120, top 520, rotation −3°, coins 18 px. Vinyle derrière, décalé de +210 px (x:90 sur la scène), il tourne (160°/s) et glisse jusqu'à x:130 pendant la tenue (`inout`).
- « Tu connais l'histoire de » : Regular 400, 68 px, top 330, left 120.
- Titre + virgule : Black Italic 900, top 1180, left 120, taille = 840 px de large (plafond 190 px).
- « de <Artiste> ? » : Regular 400, 76 px, sous le titre (top 1180 + 0.95 × taille).
- Zone sûre : tout entre y 240 et 1680 (recadrage 3:4 de la grille du profil).

| t | ouverture (durée hold + 1.1 s, hold = 2 s) |
|---|---|
| 0 → H | tenue, vinyle x 90→130 |
| H | textes y→−40, opacity 0, flou, 0.4 s, inquick, stagger 0.06 ; pochette x→−1000, rotation −16°, opacity 0, 0.6 s, inquick ; vinyle x→0, 0.7 s, inout |
| H+0.75 | scène scale→0, 0.3 s, inquick |

| t | fin en boucle (2.6 s) |
|---|---|
| 0 | scène pope : scale 0→1.06 (0.3 s, back.out(1.6)) → 1 (0.18 s) |
| E−1.55 | pochette revient (x −120, rotation −3°, opacity 1, 0.5 s, smooth) ; vinyle x→90 (0.5 s, inout) |
| E−1.2 | ligne du haut, titre, artiste : y 40→0, flou 10→0, opacity 0→1, 0.5 s, smooth, stagger 0.08 |

Les fromTo placés après 0 ont `immediateRender:false`.

---

# Ancienne intro animée (`--opening pochette`)

Générateur : `pochette.py` (même dossier). Rien n'est figé sur une chanson : on lui passe la pochette, le titre et l'artiste.

```
python3 pochette.py --cover cover.jpg --title "<Titre>" --artist "<Artiste>" \
  --hook "Tu connais l'histoire de" --mode intro|outro|both \
  --fonts <dossier Kaneda> --gsap <hyperframes>/dist/vendor/npm/gsap@3.15.0/dist --out <projet>
```

## Pochette de la chanson
- Source : API Deezer, sans clé. `https://api.deezer.com/search?q=artist:"<artiste>" track:"<titre>"` puis `data[0].album.cover_xl` (1000 px). Repli : `/search/album?q=<titre> <artiste>`.
- Domaines à autoriser : `api.deezer.com`, `cdn-images.dzcdn.net`.
- Le script recadre au carré au centre et redimensionne en 1000×1000 (`assets/img/cover.jpg`). La même image sert au rond du vinyle (38 % du disque) et à la pochette.

## Mise en page (1080×1920, fond blanc)
- Scène : 600×600, left 240, top 520. Pochette : coins 18 px, ombre `0 30px 60px rgba(0,0,0,.18)`.
- Vinyle CSS : sillons en `repeating-radial-gradient`, étiquette ronde = pochette (38 %), trou blanc 2,8 %, reflet `conic-gradient` fixe. Rotation linéaire 160°/s pendant toute la séquence.
- Ligne du haut : top 400, Kaneda Regular 400, 68 px, centrée.
- Titre : top 1170, 104 px. `<Titre>,` en Kaneda **Black Italic 900** ; `de <Artiste> ?` en Regular 400.

## Eases
- `smooth` = cubic-bezier(0.22,1,0.36,1)
- `inout` = cubic-bezier(0.65,0,0.35,1)
- `inquick` = cubic-bezier(0.55,0,1,0.45)

## Intro (temps en s depuis le début)
| t | élément | animation |
|---|---|---|
| 0 | pochette | scale 0.6→1, y 220→0, opacity 0→1, blur 24→0 px, 0.75 s, smooth |
| 0.25 | ligne du haut | lettre par lettre, gris → noir, stagger 0.035 |
| 0.5 | vinyle | apparaît derrière la pochette |
| 0.55 | vinyle / pochette | vinyle x→+220 ; pochette x→−220, rotation −4°, 0.8 s, smooth |
| 1.35 | pochette | s'envole : x→−1000, rotation −16°, opacity 0, 0.6 s, inquick |
| 1.35 | vinyle | revient au centre x→0, 0.7 s, inout |
| 1.55 | titre | mots montent de y 90 avec flou 12 px, 0.6 s, smooth, stagger 0.09 |

## Sortie (E = fin de la vidéo)
| t | élément | animation |
|---|---|---|
| E−1.55 | textes | y→−40, opacity 0, blur 10 px, 0.4 s, inquick |
| E−1.55 | pochette | revient : x→−220, rotation −4°, opacity 1, 0.5 s, smooth |
| E−1.55 | vinyle | x→+220, 0.45 s, inout |
| E−1.0 | vinyle + pochette | rentrent l'un dans l'autre : x→0, rotation 0, 0.42 s, inquick |
| E−0.45 | scène | scale→0, 0.3 s, inquick |

En mode `outro` seul, la scène entre par un pop (scale 0→1.06→1, back.out) avec le vinyle déjà au centre.

## Règle des italiques (vidéo entière)
- **Quoi :** les titres d'œuvres (chanson, album : *Like a Tattoo,* *Love Deluxe*) et les mots d'aveu ou d'émotion (*pour toujours*, *effacer*, *elle*).
- **Graisse :** mot héros en Black Italic 900 ; fin de phrase tendre en Light Italic 300 ; dans un bloc cinétique, une seule ligne en Light Italic.
- **Dosage :** un seul élément en italique par écran, environ un groupe sur cinq. Jamais deux écrans italiques d'affilée.
- **Jamais** italique et couleur d'accent sur le même mot.
- Dans `timed.json`, champ `it` : `title`, `hero`, `lead`, `tail` ou `line:N`.
