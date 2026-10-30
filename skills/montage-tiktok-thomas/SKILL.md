---
name: "montage-tiktok-thomas"
description: "Monte une vidéo TikTok verticale dans le style de @thomasthbdl (fond blanc, Kaneda Gothic, cartes d'images arrondies, texte tapé synchronisé à la voix) avec HyperFrames, à partir d'une voix off et d'illustrations."
---

# Montage TikTok, style @thomasthbdl

Ce skill reproduit le style de montage de la série « Tu connais l'histoire de ce son » de @thomasthbdl (montée à l'origine dans CapCut). Il s'appuie sur HyperFrames : lis d'abord le skill `hyperframes` (contrat de rendu, boucle de travail) puis `references/types/vertical.md`, `references/captions.md` et `references/motion.md`. Les règles ci-dessous priment sur les valeurs par défaut de HyperFrames quand elles diffèrent : c'est le style de la personne, pas un choix générique.

Le son n'est pas à retravailler : la voix off (et la musique éventuelle) est posée telle quelle et sert d'horloge à tout le montage.

Les valeurs ci-dessous ont été mesurées image par image sur 25 vidéos de référence (576×1024, 30 i/s) puis converties en 1080×1920, puis ajustées avec les retours de la personne sur la vidéo « Like a Tattoo ».

## Ce qu'il faut demander (une seule fois, puis travailler)

1. **La voix off** (mp3/wav/m4a, ou une vidéo dont on garde le son). Obligatoire : tout le timing en découle.
2. **Les illustrations** : un dossier d'images, GIF ou extraits vidéo (souvent pris sur Pinterest, des clips, des pochettes d'album). Si elles sont numérotées ou nommées par mot-clé, respecte cet ordre ; sinon associe chaque image au passage du texte qui lui correspond et dis quelle association tu as faite.
3. **Le titre du morceau et l'artiste** pour la couverture et l'outro.
4. **Les polices** : Kaneda Gothic n'est pas une police libre. Demande les fichiers (Light, Regular, Medium, Bold, ExtraBold, Black, plus les italiques Light, Regular, Bold et Black, en .otf/.ttf/.woff2) à placer dans `assets/fonts/`, et déclare **une seule famille `Kaneda` avec un `@font-face` par graisse** (300, 400, 500, 700, 800, 900, et `font-style: italic` pour 300, 400, 700, 900) pour que `font-weight` choisisse le bon fichier. N'utilise jamais une police de remplacement en silence : sans les fichiers, dis-le avant de rendre (repli League Gothic + Oswald 300, rendu seulement proche).

## Format et grille

- Projet : `npx hyperframes init <dossier>`, racine en **1080×1920, 30 i/s**, `data-duration` = durée exacte de la voix off (ffprobe).
- **Fond blanc pur `#FFFFFF`** sur toute la vidéo. Jamais de dégradé, de texture ni de fond coloré. Seules exceptions : le plein écran (une fois par vidéo) et le flash gris très clair de 3 images (voir Variations). Le blanc est le personnage principal du style : entre deux idées l'écran redevient blanc.
- Une seule « scène » visuelle à la fois : une carte image + une ligne de texte au-dessus, en dessous ou à côté. Par défaut le bloc est centré horizontalement, centre optique vers y ≈ 790 px (41 % de la hauteur), dans la bande 300–1350 px (zone sûre TikTok). Environ un écran sur trois sort du centre (voir « Placement libre » plus bas).
- Rien sous la ligne y = 1350 sauf la fin d'un bloc de texte ou un texte posé en bas à gauche (« Placement libre »), qui ne descend jamais sous y = 1500. Seules exceptions : le plein écran et le grand détourage qui déborde (voir Variations).

## La carte image (élément central)

- Chaque illustration est posée dans une **carte aux coins arrondis**, sans bordure, sans ombre, sans contour.
- Largeur type **≈ 66 % de l'écran (710 px)**, variable entre 50 % (540 px, quand le texte est gros) et 80 % (860 px). Ratio de la carte = ratio de la source (carré, 4:3 ou portrait 3:4 / 9:16), `object-fit: cover`.
- **Rayon des coins ≈ 7 % de la largeur de la carte** (≈ 50 px pour 710 px).
- Les vidéos jouent dans la carte (muettes, `muted`). Les images fixes ont un **zoom doux** pendant qu'elles sont à l'écran (voir Mouvements).
- **Détourages** (personnes, objets, illustrations au trait, emojis) : pas de carte, posés directement sur le blanc (`npx hyperframes remove-background` si l'image a un fond). Les illustrations au trait (guitare, oreille, micro, personnage en méditation) sont un marqueur fort du style.
- Variante ponctuelle : un mot géant du sujet en très grand, gris très clair (`#E6E6E6`), derrière un détourage (ex. « JACKSON » derrière un portrait). Variante pochette : texte vertical tourné à 90° à côté d'une pochette.

## Typographie

- **Kaneda Gothic** partout (condensée). Le contraste vient du **mélange de graisses et de tailles dans la même ligne** :
  - Ex. « mais au » (Light) au-dessus de « faite » (Black) ; « une **grosse** production » ; « en **1993** » ; « **45** minutes ».
- Chaque groupe a **un seul mot héros**. Choisis-le comme le ferait un monteur : le mot qui porte l'émotion ou l'info (chiffre, nom propre, adjectif fort).
- **Quatre graisses, toujours les mêmes rôles** (cohérence d'une vidéo à l'autre, ne jamais improviser une autre graisse) :
  - **Light 300, ≈ 80 px** : les mots de liaison autour d'un mot héros ;
  - **Bold 700, ≈ 78 px** : une phrase sans mot héros (« avec de », « Au contraire », « il s'isole ») ;
  - **Black 900, ≈ 190 px** : le mot héros, un seul par groupe ;
  - **Regular 400, ≈ 62–68 px** : les lignes « parlées » et le texte courant des variations (voir plus bas), où le mot clé passe en Black à la même taille ou en Regular plus grand.
- **Alignement des mots** :
  - si le mot héros est précédé de **1 ou 2 mots** (« touche **autant** », « **45** minutes », « C'est la **cicatrice** »), ils sont sur **la même ligne, alignés sur la ligne de base** du mot héros (flex `align-items: baseline`, écart ≈ 22 px), jamais centrés verticalement ;
  - au-delà, les mots de liaison passent sur la ligne au-dessus et la suite sur la ligne en dessous ;
  - la ponctuation qui suit le héros reste collée à lui ; un mot ne se coupe jamais (chaque mot dans un `inline-block` `nowrap`).
- Bloc de texte **aligné à gauche, calé sur le bord gauche de la carte image** quand il y en a une (même colonne pour l'image et le texte) ; centré sur l'écran pour un texte seul ou sous un détourage. Interligne serré (0.86–1.0).
- **Couleur d'accent** : le mot héros prend parfois (≈ 1 groupe sur 4) une couleur **prélevée dans l'image affichée** (rose poudré pour un tableau rose, bleu nuit pour une image bleue, ocre pour une image dorée, rouge pour « Blood »), assombrie si besoin pour rester lisible sur blanc (contraste ≥ 4.5:1). Jamais de couleur hors palette de l'image.
- **Lignes « parlées » (abonnement, titre, accroche)** : pas de graisse partout. Une ligne en **Regular 400**, et seul le mot clé passe en **Black 900**, même famille et même taille, dans la même ligne (≈ 68 px) : « alors **abonne-toi** pour la suite, », « ça me soutient **énormément**. », « Je raconte l'histoire derrière vos chansons préférées, » (aucun mot en gras). Titre : « ***<Titre>,*** de <Artiste> ? » (titre en Black Italic, le reste en Regular, Kaneda, jamais une police script).
- **Italiques**, pour varier sans casser l'harmonie :
  - **quoi** : les titres d'œuvres (chanson, album : « *Like a Tattoo,* », « *Love Deluxe* ») et les mots d'aveu ou d'émotion (« *pour toujours* », « *effacer* ») ;
  - **graisse** : mot héros en **Black Italic 900** ; fin de phrase tendre en **Light Italic 300** (« gravée *pour toujours* ») ; dans un bloc cinétique, une seule ligne en Light Italic ; dans la ligne titre, le titre du morceau en Black Italic ;
  - **dosage** : un seul élément en italique par écran, environ un groupe sur cinq, jamais deux écrans italiques d'affilée ;
  - **jamais** italique et couleur d'accent sur le même mot.
- Pas de contour, pas d'ombre, pas de fond derrière le texte, pas d'emoji dans le texte.

## Texte synchronisé à la voix

1. Transcris en français avec horodatage par mot : `npx hyperframes transcribe assets/voice.mp3 --model small --language fr --json` (`medium` si de la musique couvre la voix). Lis le résultat et corrige les mots mal reconnus, surtout les noms propres.
2. Découpe en groupes de **2 à 6 mots** (une idée, une respiration). Coupe à chaque pause ≥ 150 ms.
3. **Effet machine à écrire, lettre par lettre**, calé sur la voix : chaque lettre apparaît en fondu très court (0.06 s, gris clair `#C8C8C8` → noir) ; la vitesse est réglée pour que le dernier caractère d'un mot tombe à la fin du mot prononcé (≈ 15–25 caractères/s). Le mot héros se tape aussi lettre par lettre, dans sa grande taille.
4. Variante (≈ 1 groupe sur 3, pour varier) : le groupe entier apparaît en gris clair puis passe au noir en 0.15 s quand le mot est prononcé (« De là-haut »).
5. Un groupe reste affiché jusqu'au début du suivant ; jamais deux groupes sans rapport à l'écran.
6. Chaque lettre est un `<span class="ch">` écrit dans le HTML (pas généré par script, conformément au contrat HyperFrames).

## Mouvements (vocabulaire du style)

Les entrées et sorties sont rapides : **0.15–0.5 s**. Pendant qu'une image tient, elle vit avec un zoom doux. Utilise ces gestes et uniquement eux.

**Courbes de vitesse « pro »** (déclarées avec le plugin `CustomEase` de GSAP, fourni avec HyperFrames) :

```js
gsap.registerPlugin(CustomEase);
CustomEase.create("smooth",  "0.22,1,0.36,1");  // entrées : départ vif, arrivée très douce
CustomEase.create("inout",   "0.65,0,0.35,1");  // reposes et zooms longs
CustomEase.create("inquick", "0.55,0,1,0.45");  // sorties : accélère jusqu'à disparaître
```

N'utilise jamais `linear` ni `power1` pour un mouvement visible (seule exception : la rotation constante du vinyle).

| Geste | Construction (GSAP) | Quand |
| --- | --- | --- |
| **Pop depuis un point** | `scale: 0 → 1.06 → 1`, 0.3 s `back.out(1.6)` puis 0.18 s `smooth` ; l'élément naît d'un petit point au centre de sa position | Entrée d'une carte ou d'un détourage, la plus fréquente |
| **Effondrement en point** | `scale: 1 → 0`, 0.12–0.18 s, `inquick` ; un point de 6 px reste 1 image puis l'écran est blanc | Sortie de fin d'idée (texte et carte ensemble) |
| **Grossir-reposer** | carte qui arrive à 85 %, passe à 104 % en 0.32 s (`smooth`) puis se pose à 100 % en 0.25 s (`inout`) | Entrée d'une image importante |
| **Depuis la droite / la gauche** | `x: ±760, scale: 0.6, rotation: ±8° → 0`, 0.5 s, `smooth` | Entrée d'une carte ou d'un détourage (ex. la guitare) |
| **Montée depuis le bas** | `y: 620, opacity: 0 → y: 0, opacity: 1`, 0.5 s, `smooth` | Entrée d'une carte, varie avec le pop |
| **Descente depuis le haut** | `y: -620, opacity: 0 → 0`, 0.5 s, `smooth` | Entrée d'une carte, varie avec la montée |
| **Zoom vers l'intérieur** | `scale: 1.45, opacity: 0 → 1`, 0.45 s, `smooth` ; la carte arrive « de la caméra » et se pose | Image forte ou changement de lieu |
| **Zoom doux pendant la tenue** | sur l'`<img>` dans la carte (pas sur la carte) : `scale 1 → 1.12` ou `1.12 → 1` en alternance, sur toute la durée de la tenue, `sine.inOut` ; détourages : `1 → 1.05` | Toujours, sur chaque image fixe |
| **Reposer du texte** | le bloc de texte arrive de `y: 24, scale: 0.97` à sa place en 0.4 s, `smooth`, pendant que les lettres se tapent | Chaque groupe de texte |
| **Glissé diagonal** | entrée depuis bas-gauche (`x: -500, y: 250` → 0) en 0.45 s, `smooth`, flou de mouvement (`data-motion-blur="on"` sur la racine) | Image qui « arrive » dans la conversation, ≈ 1 fois par vidéo |
| **Recadrage pour faire de la place** | quand un texte arrive, la carte déjà là rétrécit (1 → 0.78) et/ou monte de 80–150 px en 0.25 s, `smooth` ; le texte apparaît dans l'espace libéré | À chaque ajout d'un élément à un écran déjà occupé |
| **Coupe sèche sur blanc** | 2 à 6 images totalement blanches entre deux idées | Transition par défaut entre deux sujets |
| **Balayage diagonal** | une bande blanche inclinée à ≈ 20° traverse la carte (`clip-path: polygon(...)`) en 0.25 s, puis le texte suivant apparaît | Transition forte, 1 à 2 fois par vidéo |
| **Fondu au gris** | le texte passe du noir au gris clair en 0.15 s juste avant de disparaître | Sortie douce d'un texte, alternative à l'effondrement |

**Le texte bouge aussi (on est sur TikTok)** : chaque partie du texte a sa propre entrée, en plus de la frappe lettre par lettre.
- Les mots de liaison entrent du **même côté que l'image** (image qui arrive de la droite → texte qui arrive de la droite, `x: 320 → 0`, 0.45 s, `smooth`).
- Le mot héros entre **par une autre direction** au moment où il est prononcé (du bas `y: 180 → 0`, ou en zoom `scale: 1.6 → 1`). Exemple : la guitare arrive de la droite, « Juste une » arrive de la droite, « **guitare,** » monte du bas.
- Correspondance par défaut entrée image → (texte, héros) : pop → (bas, zoom) ; depuis la droite → (droite, bas) ; depuis la gauche → (gauche, bas) ; montée → (bas, bas) ; descente → (haut, zoom) ; zoom vers l'intérieur → (zoom, bas) ; glissé → (gauche, droite) ; grossir-reposer → (droite, bas). Les groupes qui suivent sur la même image et les textes seuls tournent entre (bas, zoom), (gauche, bas), (zoom, droite), (droite, bas).

**Bloc cinétique** pour une phrase longue sans image (≥ 8 mots, ex. « et cette idée : il y a des souvenirs qu'on ne peut pas effacer. ») : découpe-la en 3 à 5 lignes de sens, chaque ligne mise à la **même largeur** (≈ 820 px, la taille de police varie donc d'une ligne à l'autre ; mesure la largeur avec le vrai fichier de police), graisses alternées Light / Bold et la ligne du mot héros en Black. Chaque ligne arrive du bas (`y: 140, scale: 0.7, opacity: 0 → 1`, 0.4 s, `smooth`) quand elle est dite ; le bloc entier se recentre et se réduit à chaque nouvelle ligne (les lignes se poussent et prennent la place les unes des autres) jusqu'à former un bloc justifié harmonieux.

**Variations de mise en page et de texte** (relevées image par image sur la vidéo « The Lady in My Life » de la personne) :
- **Placement libre** : environ un écran sur trois, le bloc quitte le centre et se cale dans un coin ou sur un bord (haut droite aligné à droite, bas gauche aligné à gauche, haut gauche) ; l'écran suivant change de zone. Le texte seul, sans image, est souvent posé ainsi, petit (≈ 62 px), avec beaucoup de blanc autour. Tout reste dans la zone sûre (x 90–990, y 300–1500).
- **Emphase par la taille seule** : dans une ligne Regular, le mot clé reste en Regular mais passe à ≈ 1.45× la taille (« quand **Quincy Jones** lui », « dans les **dernières** minutes ») ; à utiliser pour les noms propres, en alternance avec l'emphase par la graisse.
- **Gras en ligne, même taille** : une phrase Regular ≈ 62 px où le mot clé passe en Black 900 sans changer de taille (« pour l'album **Thriller** », « Michael était tellement **mal à l'aise** », « **coupée** avant la sortie »). C'est la forme la plus fréquente sur les textes longs ; garde le mot héros géant (190 px) pour les mots courts et forts.
- **Le texte descend sur la carte** : la ligne au-dessus d'une carte naît plus haut, plus grosse, floue et grise (`y: −90, scale: 1.15, blur 8 px, #BBB`) et se pose en noir (0.7 s, `smooth`). Elle peut aussi naître sous la carte et monter (`y: +60`), floue et grise.
- **Texte à côté de l'image** : carte portrait à gauche (≈ 420×640), deux lignes courtes à sa droite, alignées à gauche, centrées sur la hauteur de la carte, Regular + Light ; le texte glisse de `x: −60` (0.45 s, `smooth`).
- **Révélation depuis une ligne** : un trait noir vertical (4 px, hauteur de la future carte) se dessine au centre (`scaleY 0 → 1`, 0.35 s), reste un instant seul sur le blanc, puis la carte s'ouvre depuis ce trait (`clip-path: inset(0 50% 0 50%) → inset(0)`, 0.5 s, `smooth`). Transition forte, 1 fois par vidéo.
- **Réduction en vignette vers un coin** : à la fin d'une idée, la carte rétrécit à ≈ 28 % en filant vers un coin haut (`transform-origin` du coin, 0.5 s, `inout`), puis s'éteint en point (0.18 s) ; le texte suivant apparaît dans une autre zone.
- **Le geste illustre le mot** : quand un mot décrit une action physique, l'image la fait. « coupée » : le vinyle (ou la carte) est tranché net en diagonale (deux copies de l'élément avec `clip-path: polygon` complémentaires), le morceau du haut s'envole et s'efface, le reste glisse un peu vers le bas en tournant. Autres exemples : « effacée » → la carte se gomme de gauche à droite, « éteigne » → l'image passe au noir, « s'isole » → la carte rétrécit seule au milieu du blanc. Au plus 1 à 2 fois par vidéo.
- **Vinyle comme carte** : au milieu de l'histoire, quand on parle d'une version ou d'un disque, un vinyle (étiquette = photo de l'artiste ou pochette) remplace la carte, tourne lentement et porte le texte dessous.
- **Carte portrait haute** : pour une illustration ou un portrait, carte 9:16 étroite (≈ 400 px de large) plutôt que carrée.

**Variations relevées sur « ghostin » et « Dangerous »** (à doser comme les précédentes, au plus une ou deux par vidéo chacune) :
- **Petit + grand, même graisse** : sur une ligne, les mots de liaison en Regular ≈ 62 px et le groupe clé en Regular ≈ 110–120 px, alignés sur la ligne de base (« et pourtant **chaque soir** », « c'est **une autre personne** / qui occupe **tes pensées** », aligné à droite). Pas de gras : seule la taille parle.
- **Bloc mixte aligné à droite** : 3 à 5 lignes courtes au-dessus de la carte, alignées à droite, Regular avec 1 ou 2 mots par ligne en Black un peu plus grand (×1.35) : « Tu es **amoureux** / d'une version de cette / **personne** que tu as / **créée** dans ta **tête** ». Les lettres se tapent d'un trait.
- **Fondu dans la carte** : deux ou trois images se succèdent dans la même carte par fondu enchaîné (0.6 s, `sine.inOut`) pendant que le texte reste ; la carte ne bouge pas.
- **Triptyque** : une seule carte large (≈ 860×420) coupée en trois photos séparées par un trait blanc de 8 px ; les trois montent du bas l'une après l'autre (`y: 440 → 0`, 0.5 s, `smooth`, décalage 0.09 s). Pour comparer ou énumérer des personnes (« Pete Davidson ou **Mac Miller** »).
- **Apparition floue** : un détourage (silhouette, fantôme, souvenir) naît dans le flou (`blur 30 → 0, scale 1.08 → 1, opacity 0 → 1`, 0.9 s, `smooth`) quand on parle de quelque chose d'irréel ; il sort en étant tranché en diagonale (`clip-path` qui remonte en biais, 0.3 s, `inquick`), puis le texte suivant arrive seul.
- **Plein écran** : une seule fois par vidéo, au moment le plus fort (sortie de l'album, date clé), coupe sèche vers une image qui remplit tout l'écran sans carte ni coins, zoom arrière lent `1.12 → 1` ; le titre s'y tape en Black ≈ 190 px dans une couleur prélevée dans l'image (« **DANGEROUS** » en rouge), puis « en octobre **1990** » en blanc. Retour au blanc par coupe sèche.
- **Le geste illustre le mot, « tombé »** : l'objet détouré se soulève à peine (`y −30, rotation −3°`, 0.25 s) puis bascule et tombe hors du cadre (`y +520, x +180, rotation 24°, opacity 0`, 0.5 s, `inquick`, pivot en bas à droite) exactement sur le mot.
- **Grand détourage qui déborde** : quand un nouveau personnage entre dans l'histoire, son portrait détouré, très grand (≈ 800 px de large), monte du bas et reste coupé par le bord bas et le bord gauche de l'écran ; la carte de la scène continue au-dessus à droite, et son nom s'écrit en Black ≈ 78 px à côté de lui. Il peut rester plusieurs écrans pendant que les cartes au-dessus changent.
- **Texte au gris, la carte grandit** : à la fin d'un groupe, le texte au-dessus de la carte passe au gris (0.15 s) et s'efface, et la carte portrait grandit (`scale 1 → 1.3`, origine en haut, 0.4 s, `smooth`) pour prendre la place libérée avant le groupe suivant.
- **Fin « le vinyle tombe »** (variante de l'outro, quand la boucle de couverture n'est pas voulue) : le vinyle tombe d'en haut à droite et se pose au centre en tournant (0.55 s, `smooth`), le titre apparaît en gris clair puis fonce au noir (Regular ≈ 120 px), l'artiste dessous en Light Italic (jamais une police script).

**Variations relevées sur « The Lost Children » et « She's Out of My Life »** :
- **Entrée inclinée en arc** : la carte arrive petite et penchée depuis le bas-gauche (`x −260, y +420, rotation −9°, scale 0.55`), passe par une position intermédiaire et se redresse à sa place (0.18 s puis 0.35 s `smooth`) sous un texte déjà tapé. Variante plus vivante du glissé diagonal.
- **Image floue pour le mystère** : quand le texte parle de quelque chose de caché, d'oublié ou de peu connu (« les **moins** connues », « son secret le plus intime »), la carte (ou pochette + vinyle) se floute volontairement (`blur 0 → 10 px`, 0.6 s, `sine.inOut`) et reste floue sous le texte. C'est le seul cas où une image floue est permise.
- **La carte change de format** : sur le même emplacement, l'image suivante a un autre format (paysage → portrait) ; la carte change de forme en 0.35 s (`inout`) en animant son `clip-path: inset(... round 40px)` sur une boîte fixe (jamais `width`/`height`), et l'image change au même instant. Le texte au-dessus ne bouge pas.
- **Texte sous la carte, trois styles dans la ligne** : la ligne se pose sous la carte, alignée sur son bord gauche, et mélange Regular, Black Italic et Black plus grand dans la même ligne (« le ***propre fils*** de **Michael** »), alignée sur la ligne de base. Compte comme l'unique italique de l'écran.
- **La carte s'évapore au blanc** : fin de chapitre douce, la carte pâlit et s'efface dans le blanc (`opacity 0, brightness 1.6, blur 4 px, scale 1.03`, 0.6 s, `inout`). Alternative à l'effondrement en point, au plus 2 fois par vidéo.
- **Note de musique** : quand la chanson est nommée sur le vinyle (couverture, fin, vinyle comme carte), un petit ♪ noir (≈ 120 px) pope au-dessus du disque (`scale 0 → 1, rotation −20° → 0`, 0.35 s, `back.out(2)`) puis se balance doucement (`y −40, rotation 10°`, aller-retour, `sine.inOut`). Une fois par vidéo.
- **Le geste illustre le mot, « se briser »** : la carte vole en éclats sur le mot. Quatre copies de la carte découpées en morceaux (`clip-path: polygon` qui se partagent la carte) remplacent la carte entière et partent vers les quatre coins (`±400 px, rotation ±30°, opacity 0`, 0.4 s, `inquick`, décalées de 0.02 s), puis la phrase se tape seule sur le blanc.
- **Texte posé dans la carte** : pour un mot d'émotion, la ligne s'écrit en blanc dans le coin bas-gauche de l'image (marge ≈ 40 px, Regular + Black ≈ 92 px), sans ombre ni bandeau. Seulement sur une image assez sombre à cet endroit (contraste ≥ 4.5:1).
- **Transition flou + flash gris** : la carte se floute d'un coup (`blur 14 px, scale 0.96`, 0.2 s, `inquick`), l'écran passe 3 images en gris très clair `#F2F2F2`, puis la carte suivante apparaît nette à la même place avec un léger zoom arrière. Pour un saut dans le temps ou un souvenir, au plus 1 fois par vidéo.

Règles de rythme :
- Un nouvel élément (texte, carte ou changement de carte) **toutes les 1 à 2 s**. Une image reste rarement plus de 4 s, sauf une vidéo qui joue.
- Les entrées d'images tombent **sur le mot** auquel elles correspondent dans la voix, pas avant.
- Varie les gestes : fais tourner les entrées dans l'ordre pop → depuis la droite → montée → zoom vers l'intérieur → depuis la gauche → descente → grossir-reposer → glissé, jamais le même geste deux fois de suite.
- Une carte posée ne se déplace plus, sauf pour faire de la place ou pour un geste listé ici (réduction en vignette, la carte grandit, le geste illustre le mot) ; sinon seule l'image à l'intérieur zoome doucement.

## Structure d'un épisode

1. **Couverture « bac à disques » (0–2 s) puis accroche** (voir la section dédiée) : la vidéo s'ouvre sur une image fixe et nette dès la frame 0, qui sert de cover TikTok : pochette à gauche, vinyle qui en sort à droite et tourne, « Tu connais l'histoire de » au-dessus, « ***<Titre>,*** de <Artiste> ? » en dessous, aligné à gauche. Puis la pochette s'envole, le vinyle se centre et se réduit à un point, et l'histoire commence.
2. **Appel à l'abonnement (≈ 2.5–4 s)** : petite mascotte emoji (visage jaune suppliant, ≈ 130 px) au centre, « alors **abonne-toi** pour la suite » tapé dessous en Regular avec le mot clé en Black (voir Lignes « parlées »).
3. **Corps** : une idée = une carte + un groupe de texte. Enchaîne selon la voix avec le vocabulaire ci-dessus. Revient au blanc entre les chapitres de l'histoire. Insère un mème ou une réaction (Bob l'éponge, personne endormie, etc.) aux moments d'ironie, quand la personne en fournit.
4. **Outro (5–7 dernières s)** : la mascotte revient avec « je raconte l'histoire derrière vos chansons préférées / abonne-toi pour la suite ça me soutient énormément » en Regular (mots clés en Black), puis **retour exact sur l'image de couverture** pour que la boucle TikTok soit invisible : le vinyle pope au centre, la pochette revient à gauche, le titre et l'artiste remontent ; la dernière image est identique à la première.

Garde les éléments récurrents (mascotte, polices, vinyle) dans `assets/` d'un projet à l'autre : demande-les la première fois et réutilise-les ensuite.

Vinyle en HTML/CSS : disque `repeating-radial-gradient` noir (sillons), étiquette ronde à 38 % du diamètre avec la pochette en `background-size: cover`, trou central blanc, reflet `conic-gradient` fixe par-dessus ; seuls le disque et l'étiquette tournent.

## Couverture, intro et sortie « Pochette » (même chose pour toutes les chansons)

Rien n'est figé sur une chanson : seuls la pochette, le titre et l'artiste changent.
- **Pochette** : API Deezer sans clé, `https://api.deezer.com/search?q=artist:"<artiste>" track:"<titre>"` → `data[0].album.cover_xl` (1000 px) ; repli `/search/album?q=<titre artiste>`, sinon celle fournie. Recadrée au carré au centre. La même image sert de pochette et d'étiquette du vinyle. Domaines à autoriser : `api.deezer.com`, `cdn-images.dzcdn.net`.
- **Couverture « bac à disques »** (choix de la personne, par défaut) : frame 0 déjà complète, tenue 2 s. Pochette 600 px à `left 120, top 520`, rotation −3° ; vinyle derrière, décalé de +210 px vers la droite, qui tourne et glisse encore de 40 px pendant la tenue (`inout`). « Tu connais l'histoire de » Regular 68 px à `top 330, left 120` ; titre en Black Italic à `top 1180, left 120`, taille calculée pour 840 px de large (plafond 190 px, mesurée avec la vraie police) ; « de <Artiste> ? » Regular 76 px juste dessous. Tout tient dans la zone 3:4 que TikTok garde sur la grille du profil (y 240–1680).
- **Sortie de la couverture** (à 2 s) : textes `y→−40, opacity 0, flou`, 0.4 s `inquick`, stagger 0.06 ; pochette s'envole `x→−1000, rotation −16°`, 0.6 s `inquick` ; vinyle au centre, 0.7 s `inout` ; à +0.75 s la scène se réduit à un point (0.3 s `inquick`).
- **Fin en boucle** (2.6 s) : le vinyle pope au centre ; à E−1.55 la pochette revient à sa place de couverture (0.5 s `smooth`) et le vinyle repart à droite ; à E−1.2 le titre, l'artiste et la ligne du haut remontent de `y 40` avec flou (0.5 s `smooth`, stagger 0.08). La dernière image est la couverture.
- Les `fromTo` placés après 0 prennent `immediateRender:false`, sinon ils vident la frame 0.
- L'ancienne intro animée (pochette floue → vinyle → titre centré) reste disponible avec `--opening pochette` :
  - **Mise en page** : scène 600×600 (left 240, top 520) ; pochette coins 18 px, ombre `0 30px 60px rgba(0,0,0,.18)` ; ligne du haut top 400, Regular 68 px ; titre top 1170, 104 px, titre en Black Italic, « de <Artiste> ? » en Regular.
  - **Intro** (s) : 0 pochette `scale 0.6→1, y 220→0, opacity 0→1, blur 24→0`, 0.75 s `smooth` · 0.25 ligne du haut tapée (stagger 0.035) · 0.5 vinyle visible derrière · 0.55 vinyle `x→+220` et pochette `x→−220, rotation −4°`, 0.8 s `smooth` · 1.35 pochette s'envole `x→−1000, rotation −16°, opacity 0`, 0.6 s `inquick`, vinyle `x→0`, 0.7 s `inout` · 1.55 mots du titre montent de `y 90` avec flou 12 px, 0.6 s `smooth`, stagger 0.09.
  - **Sortie** (E = fin) : E−1.55 textes `y→−40, opacity 0, flou`, 0.4 s `inquick` ; pochette revient `x→−220, rotation −4°, opacity 1`, 0.5 s `smooth` ; vinyle `x→+220`, 0.45 s `inout` · E−1.0 vinyle et pochette `x→0, rotation 0`, 0.42 s `inquick` · E−0.45 scène `scale→0`, 0.3 s `inquick`.
- Générateur prêt à l'emploi et spec complète : `/mnt/project-files/skill-tiktok/pochette/` et `skills/pochette/` du dépôt tiktok_video (`pochette.py --cover --title --artist --mode intro|outro|both [--opening cover|pochette] [--hold 2]`, `SPEC.md`).

## Construction HyperFrames

- Racine `index.html` : la voix off en `<audio id="vo" src="assets/voice.mp3">`, une sous-composition par chapitre dans `compositions/` (couverture, abonnement, corps-1…, outro) pour éviter `timeline_track_too_dense`.
- Chaque élément animé est enveloppé : la `.clip` gère l'apparition (`data-start`/`data-duration`), un enfant `.inner` reçoit `scale`/`x`/`y`. Jamais d'animation de `display`/`visibility` sur la `.clip`.
- Les textes, couleurs d'accent et sources d'images sont des variables (`data-var-text`, `data-var-src`, `var(--accent)`) pour que la personne puisse les modifier dans l'app HyperFrames.
- Une seule timeline en pause par composition, enregistrée dans `window.__timelines`. Tout temps est calculé depuis les horodatages de la transcription, jamais à la main au jugé.
- **Texte stable (anti-tremblement)** : tout élément que GSAP déplace ou redimensionne (bloc de texte, ligne, partie de ligne, `.inner` de carte, vinyle, détourage, `<img>` qui zoome) porte `will-change: transform` dans le CSS. Sans ça, Chrome arrondit la position du texte au pixel entier à chaque image : un texte qui glisse de 24 px en 0.4 s avance par sauts de 0 puis 1 px (mesuré : écart de 0.81 px d'une image à l'autre, contre 0.11 px avec `will-change`) et paraît trembler, surtout sur les mouvements lents (« Reposer du texte », dérive du vinyle de couverture, bloc cinétique qui se réduit). Jamais sur chaque lettre `.ch` (des centaines de calques pour rien : les lettres ne bougent pas, elles changent de couleur). La netteté finale est identique (mesurée).
- Évite aussi les causes voisines de flottement : pas de `top`/`left`/`width` animés (seulement `x`, `y`, `scale`, `rotation`), pas de `scale` sur un parent ET sur l'enfant au même moment, et un seul tween à la fois par propriété sur un même élément.
- Charge `CustomEase.min.js` après `gsap.min.js` (les deux dans `assets/`, même version, copiés depuis le dossier `vendor/npm/gsap@*/dist` de HyperFrames si le CDN est bloqué).

Exemple d'un écran « carte + mot héros » :

```html
<div id="c3" class="clip" data-start="9.80" data-duration="1.70" data-track-index="1">
  <div class="stack">
    <div class="card inner"><img src="assets/img/coeur.jpg" data-var-src="c3_img"></div>
    <p class="line row"><span class="light">ultra</span><span class="hero" style="color:var(--accent-c3)">romantique</span></p>
  </div>
</div>
```

```js
const c = "#c3 .card";
tl.fromTo(c, { scale: 0 }, { scale: 1.06, duration: 0.3, ease: "back.out(1.6)" }, 9.80)
  .to(c, { scale: 1, duration: 0.18, ease: "smooth" }, 10.10);
// zoom doux sur l'image pendant toute la tenue
tl.fromTo("#c3 img", { scale: 1 }, { scale: 1.12, duration: 1.70, ease: "sine.inOut" }, 9.80);
// lettres tapées : chaque <span class="ch"> calé sur l'horodatage du mot
tl.fromTo("#c3 .ch", { opacity: 0, color: "#C8C8C8" },
  { opacity: 1, color: "#111", duration: 0.06, stagger: 0.045 }, 10.30); // couleur finale réelle (#111 ou l'accent), jamais "inherit"
// le texte bouge : liaison du côté de l'image, héros par le bas
tl.fromTo("#c3 .light", { y: 180, opacity: 0 }, { y: 0, opacity: 1, duration: 0.45, ease: "smooth" }, 10.30);
tl.fromTo("#c3 .hero", { scale: 1.6, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.45, ease: "smooth" }, 10.55);
// sortie : effondrement en point
tl.to("#c3 .stack", { scale: 0, duration: 0.15, ease: "inquick" }, 11.35);
```

CSS de base :

```css
#root { background:#fff; }
.stack { display:flex; flex-direction:column; align-items:center; gap:28px; }
.card { width:710px; border-radius:50px; overflow:hidden; }
.card img, .card video { width:100%; display:block; object-fit:cover; }
@font-face { font-family:"Kaneda"; font-weight:300; src:url("assets/fonts/Kaneda-Light.otf"); }
@font-face { font-family:"Kaneda"; font-weight:400; src:url("assets/fonts/Kaneda-Regular.otf"); }
@font-face { font-family:"Kaneda"; font-weight:700; src:url("assets/fonts/Kaneda-Bold.otf"); }
@font-face { font-family:"Kaneda"; font-weight:900; src:url("assets/fonts/Kaneda-Black.otf"); }
.line  { font-family:"Kaneda"; color:#111; text-align:left; }
.row   { display:flex; align-items:baseline; gap:0 22px; flex-wrap:wrap; }
.light { font-weight:300; font-size:80px; line-height:1; }
.bold  { font-weight:700; font-size:78px; line-height:1; }
.hero  { font-weight:900; font-size:190px; line-height:.86; }
.flow  { font-family:"Kaneda"; font-weight:400; font-size:68px; text-align:center; }
.flow .k { font-weight:900; }
.w     { display:inline-block; white-space:nowrap; }
/* texte stable : calque propre pour tout ce qui bouge */
.inner, .stack, .line, .row > span, .card img { will-change:transform; }
```

## Plusieurs versions d'une même vidéo

Quand la personne demande plusieurs versions, garde le style (polices, graisses, fond blanc, vinyle, mascotte, courbes) et fais varier seulement :
- le point de départ du cycle des entrées d'images (et donc des directions du texte) ;
- le choix des mots héros (2e meilleur candidat sur quelques groupes) et les groupes qui prennent la couleur d'accent ;
- les phrases longues traitées en bloc cinétique ;
- l'alternance du zoom doux (avant / arrière).
Rends chaque version dans son propre fichier (`<titre>-vA.mp4`, `-vB.mp4`…) et dis en une ligne ce qui change entre elles.

## Avant de livrer

- Vérifie dans un snapshot que la police chargée est bien Kaneda (lettres très condensées) et que les graisses sont distinctes.
- `npx hyperframes check --json` sans erreur.
- `npx hyperframes snapshot --review` puis compare avec une vidéo de référence de la personne : `snapshot --at <t,…> --against ref.mp4`. Vérifie : fond blanc partout, une seule idée par écran, mots héros bien choisis, entrées d'images synchrones avec la voix, aucune image floue (sauf « Image floue pour le mystère ») ni filigrane étranger visible en grand.
- Vérifie la frame 0 : elle doit déjà montrer la couverture complète (pochette, vinyle, titre, artiste), et la dernière image doit être la même.
- Pour la relecture, publie une page plan par plan (vidéo, vignette de chaque plan, champ de commentaire enregistré) et corrige à partir des commentaires ; ajoute ici toute règle qui en sort.
- Ouvre l'aperçu dans l'app HyperFrames et laisse la personne valider avant le rendu final 1080×1920.