"""Génère l'intro et/ou la sortie « Pochette » (vinyle + pochette) pour n'importe quelle chanson.

Usage :
  python3 pochette.py --cover cover.jpg --title "Like a Tattoo" --artist "Sade" \
      --fonts chemin/vers/fonts --mode intro --out dossier_projet
  puis : cd dossier_projet && npx hyperframes render --quality delivery --output intro.mp4

--opening cover (défaut) : la vidéo s'ouvre sur la couverture « bac à disques » (pochette à gauche, vinyle qui en sort,
  titre aligné à gauche), nette dès la frame 0 pour servir de cover TikTok ; la sortie revient exactement sur cette image
  pour que la boucle soit invisible.  --opening pochette : ancienne intro animée (pochette floue -> vinyle -> titre centré).
--mode intro : ouverture seule. --mode outro : sortie seule (2.6 s). --mode both : les deux à la suite (démo).
--hold : durée de tenue de la couverture (2.0 s par défaut).
Le dossier --fonts doit contenir les graisses Regular et Black de Kaneda (ex. brand/fonts/kaneda/ du dépôt) ;
la Black Italic est utilisée si elle est là, sinon l'italique est synthétisé.
gsap.min.js et CustomEase.min.js sont copiés depuis --gsap (dossier vendor/npm/gsap@*/dist de HyperFrames).
"""
import argparse, html, json, os, shutil
from PIL import Image, ImageFont

ap = argparse.ArgumentParser()
ap.add_argument('--cover', required=True)
ap.add_argument('--title', required=True)
ap.add_argument('--artist', required=True)
ap.add_argument('--hook', default="Tu connais l'histoire de")
ap.add_argument('--fonts', required=True)
ap.add_argument('--gsap', required=True)
ap.add_argument('--mode', choices=['intro', 'outro', 'both'], default='both')
ap.add_argument('--opening', choices=['cover', 'pochette'], default='cover')
ap.add_argument('--hold', type=float, default=2.0)
ap.add_argument('--out', required=True)
a = ap.parse_args()

os.makedirs(os.path.join(a.out, 'assets/fonts'), exist_ok=True)
os.makedirs(os.path.join(a.out, 'assets/img'), exist_ok=True)
for f in ('gsap.min.js', 'CustomEase.min.js'):
    shutil.copy(os.path.join(a.gsap, f), os.path.join(a.out, 'assets', f))
# accepte Kaneda-Black.otf comme kaneda-gothic-black.otf (brand/fonts/kaneda/ du dépôt)
def find_font(style):
    for f in sorted(os.listdir(a.fonts)):
        n = os.path.splitext(f)[0].lower().replace('_', '-').replace(' ', '-')
        if f.lower().endswith(('.otf', '.ttf', '.woff2')) and n.endswith('-' + style):
            return f
    return None
FONTS = {}
for style in ('regular', 'black', 'blackitalic'):
    f = find_font(style)
    if f:
        shutil.copy(os.path.join(a.fonts, f), os.path.join(a.out, 'assets/fonts', f))
        FONTS[style] = f
for style in ('regular', 'black'):
    if style not in FONTS:
        raise SystemExit(f'police Kaneda {style} introuvable dans {a.fonts}')
# sans Black Italic, pas de @font-face italique : le navigateur penche la Black (italique synthétique)
ITALIC_FACE = ('@font-face { font-family:"Kaneda"; font-weight:900; font-style:italic; src:url("assets/fonts/%s"); }'
               % FONTS['blackitalic']) if 'blackitalic' in FONTS else ''
# pochette carrée 1000 px, recadrée au centre
im = Image.open(a.cover).convert('RGB'); w, h = im.size; s = min(w, h)
im.crop(((w - s) // 2, (h - s) // 2, (w - s) // 2 + s, (h - s) // 2 + s)).resize((1000, 1000)).save(
    os.path.join(a.out, 'assets/img/cover.jpg'), quality=92)
json.dump({'id': 'pochette', 'name': 'pochette'}, open(os.path.join(a.out, 'meta.json'), 'w'))
# fichiers de projet HyperFrames, pour lancer render directement dans --out
json.dump({'$schema': 'https://hyperframes.heygen.com/schema/hyperframes.json',
           'paths': {'blocks': 'compositions', 'components': 'compositions/components', 'assets': 'assets'},
           'media': {'autoProxy': True}}, open(os.path.join(a.out, 'hyperframes.json'), 'w'), indent=2)
json.dump({'name': 'pochette', 'private': True, 'type': 'module',
           'scripts': {'check': 'npx --yes hyperframes@0.8.214 check',
                       'render': 'npx --yes hyperframes@0.8.214 render'}},
          open(os.path.join(a.out, 'package.json'), 'w'), indent=2)

INTRO, OUTRO = a.mode in ('intro', 'both'), a.mode in ('outro', 'both')
COVER = a.opening == 'cover'
H = a.hold
TI = H + 1.1 if COVER else 3.0  # durée de l'ouverture
T = {'intro': TI, 'outro': 2.6, 'both': TI + 2.6 if COVER else 6.0}[a.mode]
E = T  # fin de la composition
O = TI if (COVER and a.mode == 'both') else 0  # début de la partie sortie

def chars(t, cls=''):
    c = f' {cls}' if cls else ''
    return ' '.join(f'<span class="w{c}">' + ''.join(f'<span class="ch">{html.escape(ch)}</span>' for ch in w) + '</span>' for w in t.split(' '))

js = ['tl.fromTo("#vin .spin",{rotation:0},{rotation:%d,duration:%s,ease:"none"},0)' % (round(160 * T), T)]
# couverture « bac à disques » (les fromTo placés plus tard ont immediateRender:false pour ne pas vider la frame 0) : pochette décalée à gauche, vinyle qui en sort à droite
CS, CV = '{x:-120,rotation:-3,opacity:1}', '{x:90}'
if COVER:
    js += [f'tl.set("#sleeve",{CS},0)', f'tl.set("#vin",{CV},0)']
if COVER and INTRO:
    js += [
        # tenue : le vinyle glisse encore un peu hors de la pochette
        f'tl.to("#vin",{{x:130,duration:{H},ease:"inout"}},0)',
        f'tl.to(["#chook","#ctitle","#cart"],{{y:-40,opacity:0,filter:"blur(10px)",duration:0.4,ease:"inquick",stagger:0.06}},{H})',
        f'tl.to("#sleeve",{{x:-1000,rotation:-16,opacity:0,duration:0.6,ease:"inquick"}},{H})',
        f'tl.to("#vin",{{x:0,duration:0.7,ease:"inout"}},{H})',
        f'tl.to(".stage",{{scale:0,duration:0.3,ease:"inquick"}},{H + 0.75:.2f})',
    ]
if COVER and OUTRO:
    js += [
        f'tl.set("#sleeve",{{x:-1000,rotation:-16,opacity:0}},{O})',
        f'tl.set("#vin",{{x:0}},{O})',
        f'tl.set(["#chook","#ctitle","#cart"],{{opacity:0}},{O})',
        f'tl.fromTo(".stage",{{scale:0}},{{scale:1.06,duration:0.3,ease:"back.out(1.6)",immediateRender:false}},{O})',
        f'tl.to(".stage",{{scale:1,duration:0.18,ease:"smooth"}},{O + 0.3:.2f})',
        # retour exact sur l'image de couverture (boucle TikTok)
        f'tl.to("#sleeve",{{x:-120,rotation:-3,opacity:1,duration:0.5,ease:"smooth"}},{E - 1.55:.2f})',
        f'tl.to("#vin",{{x:90,duration:0.5,ease:"inout"}},{E - 1.55:.2f})',
        f'tl.fromTo(["#chook","#ctitle","#cart"],{{y:40,opacity:0,filter:"blur(10px)"}},{{y:0,opacity:1,filter:"blur(0px)",duration:0.5,ease:"smooth",stagger:0.08,immediateRender:false}},{E - 1.2:.2f})',
    ]
if COVER:
    pass
elif INTRO:
    js += [
        # la pochette arrive (flou -> net), le vinyle en sort, la pochette s'envole
        'tl.fromTo("#sleeve",{scale:0.6,y:220,opacity:0,filter:"blur(24px)"},{scale:1,y:0,opacity:1,filter:"blur(0px)",duration:0.75,ease:"smooth"},0)',
        'tl.fromTo("#vin",{opacity:0},{opacity:1,duration:0.01},0.5)',
        'tl.to("#vin",{x:220,duration:0.8,ease:"smooth"},0.55)',
        'tl.to("#sleeve",{x:-220,rotation:-4,duration:0.8,ease:"smooth"},0.55)',
        'tl.to("#sleeve",{x:-1000,rotation:-16,opacity:0,duration:0.6,ease:"inquick"},1.35)',
        'tl.to("#vin",{x:0,duration:0.7,ease:"inout"},1.35)',
        'tl.fromTo("#top .ch",{opacity:0,color:"#c8c8c8"},{opacity:1,color:"#111",duration:0.06,stagger:0.035},0.25)',
        'tl.fromTo("#title .w",{y:90,opacity:0,filter:"blur(12px)"},{y:0,opacity:1,filter:"blur(0px)",duration:0.6,ease:"smooth",stagger:0.09},1.55)',
    ]
else:  # sortie seule, ouverture pochette
    js += ['tl.set("#sleeve",{x:-1000,rotation:-16,opacity:0},0)',
           'tl.fromTo(".stage",{scale:0},{scale:1.06,duration:0.3,ease:"back.out(1.6)"},0)',
           'tl.to(".stage",{scale:1,duration:0.18,ease:"smooth"},0.3)']
if OUTRO and not COVER:
    js += [
        # le titre s'efface, la pochette revient, le vinyle rentre dedans, tout se réduit à un point
        f'tl.to(["#top","#title"],{{y:-40,opacity:0,filter:"blur(10px)",duration:0.4,ease:"inquick",stagger:0.06}},{E - 1.55:.2f})',
        f'tl.to("#sleeve",{{x:-220,rotation:-4,opacity:1,duration:0.5,ease:"smooth"}},{E - 1.55:.2f})',
        f'tl.to("#vin",{{x:220,duration:0.45,ease:"inout"}},{E - 1.55:.2f})',
        f'tl.to("#vin",{{x:0,duration:0.42,ease:"inquick"}},{E - 1.0:.2f})',
        f'tl.to("#sleeve",{{x:0,rotation:0,duration:0.42,ease:"inquick"}},{E - 1.0:.2f})',
        f'tl.to(".stage",{{scale:0,duration:0.3,ease:"inquick"}},{E - 0.45:.2f})',
    ]

title = f'{chars(a.title + ",", "k it")} {chars("de " + a.artist + " ?")}'
# couverture : titre ajusté à 840 px de large (plafond 190 px), mesuré avec la vraie police
TF = os.path.join(a.out, 'assets/fonts', FONTS.get('blackitalic', FONTS['black']))
CTS = min(190, int(100 * 840 / ImageFont.truetype(TF, 100).getlength(a.title + ',')))
if COVER:
    texts = (f'<div id="chook" class="cline" style="top:330px;font-size:68px">{html.escape(a.hook)}</div>'
             f'<div id="ctitle" class="cline k it" style="top:1180px;font-size:{CTS}px;line-height:1">{html.escape(a.title)},</div>'
             f'<div id="cart" class="cline" style="top:{1180 + int(CTS * 0.95)}px;font-size:76px">de {html.escape(a.artist)} ?</div>')
else:
    texts = f'<div id="top" class="line top">{chars(a.hook)}</div>\n<div id="title" class="line title">{title}</div>'
page = f'''<!doctype html>
<html lang="fr" data-resolution="portrait"><head><meta charset="UTF-8" />
<meta name="viewport" content="width=1080, height=1920" />
<script src="assets/gsap.min.js"></script><script src="assets/CustomEase.min.js"></script>
<style>
@font-face {{ font-family:"Kaneda"; font-weight:400; src:url("assets/fonts/{FONTS['regular']}"); }}
@font-face {{ font-family:"Kaneda"; font-weight:900; src:url("assets/fonts/{FONTS['black']}"); }}
{ITALIC_FACE}
* {{ margin:0; padding:0; box-sizing:border-box; }}
html,body {{ width:1080px; height:1920px; overflow:hidden; background:#fff; }}
#root {{ width:1080px; height:1920px; position:relative; background:#fff; color:#111; overflow:hidden; }}
.layer {{ position:absolute; inset:0; }}
.stage {{ position:absolute; left:240px; top:520px; width:600px; height:600px; transform-origin:50% 50%; }}
.obj {{ position:absolute; inset:0; }}
.sleeve {{ border-radius:18px; background:url(assets/img/cover.jpg) center/cover; box-shadow:0 30px 60px rgba(0,0,0,.18); opacity:0; }}
.vinyl {{ position:absolute; inset:0; border-radius:50%; overflow:hidden; box-shadow:0 30px 60px rgba(0,0,0,.22); }}
.spin, .disc, .label, .hole, .shine {{ position:absolute; border-radius:50%; }}
.spin, .disc, .shine {{ inset:0; }}
.disc {{ background:repeating-radial-gradient(circle at 50% 50%, #151515 0px, #151515 3px, #242424 4px, #151515 6px); }}
.label {{ left:31%; top:31%; width:38%; height:38%; background:url(assets/img/cover.jpg) center/cover; }}
.hole {{ left:48.6%; top:48.6%; width:2.8%; height:2.8%; background:#fff; }}
.shine {{ background:conic-gradient(from 30deg, rgba(255,255,255,0) 0deg, rgba(255,255,255,.14) 25deg, rgba(255,255,255,0) 60deg, rgba(255,255,255,0) 180deg, rgba(255,255,255,.12) 205deg, rgba(255,255,255,0) 240deg); }}
.line {{ position:absolute; left:0; width:1080px; text-align:center; font-family:"Kaneda"; font-weight:400; }}
.top {{ top:400px; font-size:68px; }}
.title {{ top:1170px; font-size:104px; padding:0 60px; }}
.cline {{ position:absolute; left:120px; font-family:"Kaneda"; font-weight:400; white-space:nowrap; }}
.k {{ font-weight:900; }} .it {{ font-style:italic; }}
.w, .ch {{ display:inline-block; }} .w {{ white-space:nowrap; }}
</style></head><body>
<div id="root" data-composition-id="main" data-start="0" data-duration="{T}" data-width="1080" data-height="1920">
<div id="scene" class="clip layer" data-start="0" data-duration="{T}" data-track-index="1">
<div class="stage"><div id="vin" class="obj"><div class="vinyl"><div class="spin"><div class="disc"></div><div class="label"></div></div><div class="hole"></div><div class="shine"></div></div></div><div id="sleeve" class="obj sleeve"></div></div>
{texts}
</div></div>
<script>
gsap.registerPlugin(CustomEase);
CustomEase.create("smooth","0.22,1,0.36,1");
CustomEase.create("inout","0.65,0,0.35,1");
CustomEase.create("inquick","0.55,0,1,0.45");
const tl = gsap.timeline({{ paused:true }});
{chr(10).join(j + ';' for j in js)}
window.__timelines["main"] = tl;
tl.seek(0);
</script></body></html>'''
open(os.path.join(a.out, 'index.html'), 'w', encoding='utf-8').write(page)
print('ok', a.mode, T, 's ->', a.out)
