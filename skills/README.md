# Skills de montage

Ce dossier contient les deux skills de la chaîne et le module de l'intro et de la sortie « Pochette ».

- `montage-tiktok-thomas/SKILL.md` : le style de montage (police Kaneda, graisses, italiques, mouvements, courbes de vitesse).
- `histoire-chanson-thomas/SKILL.md` : l'écriture du script en voix off.
- `pochette/` : l'intro et la sortie vinyle + pochette, la même pour toutes les chansons.
  - `pochette.py` génère la composition HyperFrames à partir de la pochette, du titre et de l'artiste.
  - `SPEC.md` donne les temps, les courbes, les positions et la règle des italiques.
  - `exemple-index.html` est le résultat pour *Smooth Operator* de Sade.
  - `build.py` et `timed.json` sont le générateur complet de la vidéo *Like a Tattoo*, à garder comme référence.

## Tester sur ton PC

Les polices Kaneda sont déjà dans le dépôt, dans `brand/fonts/kaneda/`. Il n'y a pas encore de Black Italic : sans elle, le navigateur penche la Black. Pour un vrai italique, ajoute `kaneda-gothic-blackitalic.otf` dans ce dossier. Puis lance :

```
pip install pillow
python skills/pochette/pochette.py --cover pochette.jpg --title "Smooth Operator" --artist "Sade" \
  --fonts brand/fonts/kaneda \
  --gsap <node_modules>/hyperframes/dist/vendor/npm/gsap@3.15.0/dist \
  --mode both --out test-pochette
cd test-pochette && npx hyperframes check && npx hyperframes render --output pochette.mp4
```

Le script écrit aussi `hyperframes.json` et `package.json`, le dossier de sortie est donc un projet HyperFrames prêt à rendre. Pour la pochette, l'API Deezer (`cover_xl`) est décrite dans `SPEC.md`.
