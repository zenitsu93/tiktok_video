# Kaneda Gothic

Les vidéos utilisent Kaneda Gothic quand ses fichiers sont dans ce dossier. Ce n'est pas une police libre, donc git ignore tout ici sauf ce fichier : chacun y met ses propres fichiers sous licence.

Il faut les cinq graisses suivantes (`.otf`, `.ttf`, `.woff` ou `.woff2`, le nom exact importe peu tant qu'il contient la graisse) :

| Dans le nom | Sert à |
| --- | --- |
| ExtraLight | textes très fins |
| Light | mots de liaison |
| Regular | lignes parlées |
| Bold | phrases sans mot héros |
| Black | mot héros |

Sans ces fichiers, les vidéos restent en Oswald. Après en avoir ajouté, relance `pnpm dev` (l'app recopie la police et le worker la relit au démarrage). Les plans déjà rendus en Oswald repassent au rendu à l'export suivant.
