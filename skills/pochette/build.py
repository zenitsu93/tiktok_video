import json, glob, os, sys, colorsys, html
from PIL import Image

P = sys.argv[1]
VAR = int(sys.argv[2]) if len(sys.argv) > 2 else 0
beats = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'timed.json'), encoding='utf-8'))
TOTAL = round(beats[-1]['end'] + beats[-1]['gap'], 2)
W, H = 1080, 1920

def img_path(name):
    for ext in ('png', 'jpg', 'jpeg', 'webp', 'svg'):
        p = f'assets/img/{name}.{ext}'
        if os.path.exists(os.path.join(P, p)):
            return p
    return None

def img_size(p):
    if p.endswith('.svg'):
        return {'platine': (520, 400), 'mascotte': (200, 220)}.get(os.path.basename(p)[:-4], (500, 500))
    return Image.open(os.path.join(P, p)).size

def accent(p):
    if p.endswith('.svg'):
        return None
    im = Image.open(os.path.join(P, p)).convert('RGB').resize((48, 48))
    best, score = None, 0
    for r, g, b in im.getdata():
        h, l, s = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
        sc = s * (1 - abs(l - 0.5))
        if sc > score:
            best, score = (h, l, s), sc
    if not best or score < 0.25:
        return None
    h, l, s = best
    r, g, b = colorsys.hls_to_rgb(h, min(l, 0.38), min(1, s))
    return '#%02x%02x%02x' % (int(r * 255), int(g * 255), int(b * 255))

# image segments: runs of consecutive beats sharing an image
segs = []
for i, b in enumerate(beats):
    nxt = beats[i + 1]['start'] if i + 1 < len(beats) else TOTAL
    b['next'] = nxt
    if b['img'] and segs and segs[-1]['img'] == b['img'] and segs[-1]['last'] == i - 1:
        segs[-1]['last'] = i
        segs[-1]['end'] = nxt
    elif b['img']:
        segs.append({'img': b['img'], 'first': i, 'last': i, 'start': b['start'], 'end': nxt})

CARD_CY = 760
COVER = img_path('cover-label')
FONT_DIR = os.path.join(P, 'assets/fonts')
from PIL import ImageFont
def text_w(t, weight, size=100):
    f = ImageFont.truetype(os.path.join(FONT_DIR, f'Kaneda-{weight}.otf'), size)
    return f.getlength(t)

layout = {}
for k, s in enumerate(segs):
    p = img_path(s['img'])
    s['src'] = p
    cutout = s['img'] in ('platine', 'mascotte', '13-guitare')
    if s['img'] == 'platine':
        w = h = 600
    else:
        iw, ih = img_size(p)
        w = {'mascotte': 220}.get(s['img'], 700)
        h = round(w * ih / iw)
        if h > 760:
            h = 760
            w = round(h * iw / ih)
    s.update(w=w, h=h, cutout=cutout, top=CARD_CY - h // 2, accent=None if s['img'] == 'platine' else accent(p))
    for i in range(s['first'], s['last'] + 1):
        layout[i] = s

def vinyl_html(size):
    return (f'<div class="vinyl" style="width:{size}px;height:{size}px"><div class="spin"><div class="disc"></div>'
            f'<div class="label" style="background-image:url({COVER})"></div></div><div class="hole"></div><div class="shine"></div></div>')

# card entrances cycle; each one sets which side the text comes from
ENTRANCES = ['pop', 'fromright', 'rise', 'zoomin', 'fromleft', 'drop', 'grow', 'slide']
FORCE = {'13-guitare': ['fromright', 'fromleft', 'rise'][VAR % 3]}
TEXT_FROM = {'fromright': ('right', 'bottom'), 'fromleft': ('left', 'bottom'), 'rise': ('bottom', 'bottom'),
             'drop': ('top', 'scale'), 'zoomin': ('scale', 'bottom'), 'slide': ('left', 'right'),
             'pop': ('bottom', 'scale'), 'grow': ('right', 'bottom'), 'pochette': ('top', 'bottom')}
out_html, js = [], []

for k, s in enumerate(segs):
    sid = f's{k:02d}'
    dur = round(s['end'] - s['start'] + 0.05, 3)
    st = round(max(0, s['start'] - 0.08), 3)
    if s['img'] == 'platine' and k == 0:
        body = f'<div class="vmove">{vinyl_html(s["w"])}</div><div class="sleeve"></div>'
    elif s['img'] == 'platine':
        body = vinyl_html(s['w'])
    else:
        cls = 'cut' if s['cutout'] else 'card'
        body = f'<div class="{cls}"><img src="{s["src"]}" data-var-src="{sid}_img" alt=""></div>'
    out_html.append(
        f'<div id="{sid}" class="clip seg" data-start="{st}" data-duration="{dur}" data-track-index="{1 + k % 2}">'
        f'<div class="inner" style="left:{(W - s["w"]) // 2}px;top:{s["top"]}px;width:{s["w"]}px;height:{s["h"]}px">{body}</div></div>')
    sel = f'#{sid} .inner'
    kind = 'pochette' if (s['img'] == 'platine' and k == 0) else FORCE.get(s['img']) or ('pop' if s['img'] in ('platine', 'mascotte') else ENTRANCES[(k + VAR * 3) % len(ENTRANCES)])
    s['kind'] = kind
    if kind == 'pochette':
        # the sleeve arrives, the record slides out of it, then the sleeve flies away
        js.append(f'tl.fromTo("#{sid} .sleeve",{{scale:0.6,y:220,opacity:0,filter:"blur(24px)"}},{{scale:1,y:0,opacity:1,filter:"blur(0px)",duration:0.75,ease:"smooth"}},{st});')
        js.append(f'tl.fromTo("#{sid} .vmove",{{opacity:0}},{{opacity:1,duration:0.01}},{st + 0.5:.3f});')
        js.append(f'tl.to("#{sid} .vmove",{{x:220,duration:0.8,ease:"smooth"}},{st + 0.55:.3f});')
        js.append(f'tl.to("#{sid} .sleeve",{{x:-220,rotation:-4,duration:0.8,ease:"smooth"}},{st + 0.55:.3f});')
        js.append(f'tl.to("#{sid} .sleeve",{{x:-1000,rotation:-16,opacity:0,duration:0.6,ease:"inquick"}},{st + 1.35:.3f});')
        js.append(f'tl.to("#{sid} .vmove",{{x:0,duration:0.7,ease:"inout"}},{st + 1.35:.3f});')
    elif kind == 'pop':
        js.append(f'tl.fromTo("{sel}",{{scale:0}},{{scale:1.06,duration:0.3,ease:"back.out(1.6)"}},{st});')
        js.append(f'tl.to("{sel}",{{scale:1,duration:0.18,ease:"smooth"}},{st + 0.3:.3f});')
    elif kind == 'grow':
        js.append(f'tl.fromTo("{sel}",{{scale:0.82,opacity:0}},{{scale:1.04,opacity:1,duration:0.32,ease:"smooth"}},{st});')
        js.append(f'tl.to("{sel}",{{scale:1,duration:0.25,ease:"inout"}},{st + 0.32:.3f});')
    elif kind == 'rise':
        js.append(f'tl.fromTo("{sel}",{{y:620,opacity:0}},{{y:0,opacity:1,duration:0.5,ease:"smooth"}},{st});')
    elif kind == 'drop':
        js.append(f'tl.fromTo("{sel}",{{y:-620,opacity:0}},{{y:0,opacity:1,duration:0.5,ease:"smooth"}},{st});')
    elif kind == 'zoomin':
        js.append(f'tl.fromTo("{sel}",{{scale:1.45,opacity:0}},{{scale:1,opacity:1,duration:0.45,ease:"smooth"}},{st});')
    elif kind in ('fromright', 'fromleft'):
        sx = 760 if kind == 'fromright' else -760
        js.append(f'tl.fromTo("{sel}",{{x:{sx},scale:0.6,rotation:{8 if sx > 0 else -8}}},{{x:0,scale:1,rotation:0,duration:0.5,ease:"smooth"}},{st});')
    else:
        js.append(f'tl.fromTo("{sel}",{{x:-560,y:280,scale:0.9}},{{x:0,y:0,scale:1,duration:0.45,ease:"smooth"}},{st});')
    hold = round(s['end'] - s['start'], 3)
    if s['img'] == 'platine':
        js.append(f'tl.fromTo("#{sid} .spin",{{rotation:0}},{{rotation:{round(160 * dur)},duration:{dur},ease:"none"}},{st});')
    elif s['cutout']:
        js.append(f'tl.fromTo("#{sid} img",{{scale:1}},{{scale:1.05,duration:{hold},ease:"sine.inOut"}},{st + 0.3:.3f});')
    elif (k + VAR) % 2 == 0:
        js.append(f'tl.fromTo("#{sid} img",{{scale:1}},{{scale:1.12,duration:{hold},ease:"sine.inOut"}},{st});')
    else:
        js.append(f'tl.fromTo("#{sid} img",{{scale:1.12}},{{scale:1,duration:{hold},ease:"sine.inOut"}},{st});')
    end = round(st + dur, 3)
    if s['img'] == '09-guerre':
        js.append(f'tl.fromTo("#{sid} .card",{{clipPath:"polygon(0% 0%,100% 0%,100% 100%,0% 100%,0% 100%,0% 100%)"}},'
                  f'{{clipPath:"polygon(0% 0%,100% 0%,100% 0%,0% 60%,0% 100%,100% 40%)",duration:0.12,ease:"none"}},{end - 0.3:.3f});')
        js.append(f'tl.to("#{sid} .card",{{clipPath:"polygon(0% 0%,0% 0%,0% 0%,0% 0%,100% 100%,100% 100%)",duration:0.14,ease:"power2.in"}},{end - 0.18:.3f});')
    elif k + 1 < len(segs) and segs[k + 1]['img'] != s['img'] and k % 2 == 0:
        js.append(f'tl.to("{sel}",{{scale:0,duration:0.15,ease:"inquick"}},{end - 0.17:.3f});')

FROM = {'right': 'x:320,opacity:0', 'left': 'x:-320,opacity:0', 'bottom': 'y:180,opacity:0',
        'top': 'y:-140,opacity:0', 'scale': 'scale:1.6,opacity:0'}
NOCARD_FROM = [('bottom', 'scale'), ('left', 'bottom'), ('scale', 'right'), ('right', 'bottom')]

def word_spans(t, cls=''):
    c = f' {cls}' if cls else ''
    return ' '.join(f'<span class="w{c}">' + ''.join(f'<span class="ch">{html.escape(ch)}</span>' for ch in word) + '</span>' for word in t.split(' '))

def split_hero(text, hero):
    a, rest = text.split(hero, 1)
    rest = rest.strip()
    m = re.match(r'^([,.;:?!]+)\s*', rest)
    h = hero
    if m:
        h = hero + m.group(1)
        rest = rest[m.end():]
    return a.strip(), h, rest

import re
VARIANT_FADE = {'b07', 'b14', 'b23'}
nocard_i = 0
for i, b in enumerate(beats):
    bid = b['id']
    s = layout.get(i)
    text, hero = b['text'], b['hero']
    start = 0 if i == 0 else round(b['start'] - 0.02, 3)
    dur = round(b['next'] - start, 3)
    if i == len(beats) - 1:
        dur = round(b['end'] + 0.15 - start, 3)
    if bid == 'b01':
        dur = round(beats[1]['next'] - start, 3)
    speak = max(0.3, b['end'] - b['start'])
    t0 = 0 if i == 0 else b['start']

    # kinetic block: lines that push each other until they form one justified block
    if b.get('lines'):
        BW, lines_html, sizes = 820, [], []
        hero_line = next((j for j, l in enumerate(b['lines']) if hero and hero in l), len(b['lines']) - 1)
        alt = ['Light', 'Bold']
        for j, l in enumerate(b['lines']):
            wt = 'Black' if j == hero_line else alt[j % 2]
            size = min(230, round(100 * BW / text_w(l, wt)))
            sizes.append(size * 0.9)
            fw = {'Light': 300, 'Bold': 700, 'Black': 900}[wt]
            ist = ';font-style:italic' if b.get('it') == f'line:{j}' else ''
            lines_html.append(f'<div class="kl" style="font-size:{size}px;font-weight:{fw}{ist}">{html.escape(l)}</div>')
        H = sum(sizes)
        out_html.append(
            f'<div id="{bid}" class="clip txt" data-start="{start}" data-duration="{dur}" data-track-index="{3 + i % 2}">'
            f'<div class="kin" style="left:{(W - BW) // 2}px;top:{round(960 - H / 2)}px;width:{BW}px">{"".join(lines_html)}</div></div>')
        total = sum(len(l) for l in b['lines'])
        acc, hk = 0, 0
        for j, l in enumerate(b['lines']):
            tj = round(t0 + speak * acc / total, 3)
            acc += len(l)
            hk += sizes[j]
            dy = round((H - hk) / 2)
            sc = round(min(1.08, 1300 / hk) if j < len(b['lines']) - 1 else 1, 3)
            js.append(f'tl.fromTo("#{bid} .kl:nth-child({j + 1})",{{y:140,opacity:0,scale:0.7}},{{y:0,opacity:1,scale:1,duration:0.4,ease:"smooth"}},{tj});')
            if j == 0:
                js.append(f'tl.set("#{bid} .kin",{{y:{dy},scale:{sc}}},{start});')
            else:
                js.append(f'tl.to("#{bid} .kin",{{y:{dy},scale:{sc},duration:0.4,ease:"smooth"}},{tj});')
        continue

    flow = bool(s and s['img'] in ('mascotte', 'platine'))
    IT = b.get('it', '')
    color = s['accent'] if (s and s.get('accent') and (i + VAR) % 4 == 2 and IT != 'hero') else ''
    cstyle = f' style="color:{color}"' if color else ''
    parts = []  # (html, chars, role)
    if flow:
        # one line of Regular text, only the key word in Black, same family and size
        words = text.split(' ')
        hw = set(hero.split(' ')) if hero else set()
        h_html = []
        for wd in words:
            core = wd.strip(',.?!')
            h_html.append(word_spans(wd, ('k it' if IT == 'title' else 'k') if core in hw else ''))
        cls = 'flow title-flow' if bid == 'b02' else 'flow'
        parts.append((f'<div class="{cls}">{" ".join(h_html)}</div>', len(text), 'lead'))
    elif hero and hero in text:
        lead, h, rest = split_hero(text, hero)
        if lead and len(lead.split()) <= 2:
            hi = ' it' if IT == 'hero' else ''
            parts.append((f'<div class="row"><span class="light part-lead">{word_spans(lead)}</span> <span class="hero part-hero{hi}"{cstyle}>{word_spans(h)}</span></div>', len(lead) + len(h), 'row'))
        else:
            if lead:
                parts.append((f'<div class="light part-lead{" it" if IT == "lead" else ""}">{word_spans(lead)}</div>', len(lead), 'lead'))
            parts.append((f'<div class="hero part-hero{" it" if IT == "hero" else ""}"{cstyle}>{word_spans(h)}</div>', len(h), 'hero'))
        if rest:
            parts.append((f'<div class="light part-tail{" it" if IT == "tail" else ""}">{word_spans(rest)}</div>', len(rest), 'tail'))
    else:
        parts.append((f'<div class="bold part-lead">{word_spans(text)}</div>', len(text), 'lead'))
    n = sum(p[1] for p in parts)
    left = None
    if s:
        top = s['top'] + s['h'] + 46
        if s['img'] == 'platine' and bid == 'b01':
            top = s['top'] - 120
        if not s['cutout']:
            left = (W - s['w']) // 2
        pos = f'top:{top}px'
    else:
        pos = 'top:780px'
    if left is not None:
        pos += f';justify-content:flex-start;padding-left:{left}px;padding-right:60px'
    out_html.append(
        f'<div id="{bid}" class="clip txt" data-start="{start}" data-duration="{dur}" data-track-index="{3 + i % 2}">'
        f'<div class="tinner" style="{pos}"><div class="block">{"".join(p[0] for p in parts)}</div></div></div>')
    if bid in VARIANT_FADE:
        js.append(f'tl.fromTo("#{bid} .ch",{{opacity:0}},{{opacity:1,duration:0.01}},{start});')
        js.append(f'tl.fromTo("#{bid} .block",{{color:"#c8c8c8"}},{{color:"#111",duration:0.18}},{start + speak * 0.5:.3f});')
    else:
        stg = round(speak * 0.92 / max(1, n), 4)
        js.append(f'tl.fromTo("#{bid} .ch",{{opacity:0,color:"#c8c8c8"}},{{opacity:1,color:"inherit",duration:0.06,stagger:{stg}}},{t0});')
    # text movement: the lead and the hero come from their own sides
    if s and s.get('kind') and i == s['first']:
        dl, dh = TEXT_FROM[s['kind']]
    elif s:
        dl, dh = NOCARD_FROM[(i + 1 + VAR) % len(NOCARD_FROM)]
    else:
        dl, dh = NOCARD_FROM[(nocard_i + VAR * 2) % len(NOCARD_FROM)]
        nocard_i += 1
    stg = speak * 0.92 / max(1, n)
    lead_chars = sum(p[1] for p in parts if p[2] == 'lead')
    js.append(f'tl.fromTo("#{bid} .block > :first-child",{{{FROM[dl]}}},{{x:0,y:0,scale:1,opacity:1,duration:0.45,ease:"smooth"}},{start});')
    if any(p[2] in ('hero', 'row') for p in parts):
        th = round(t0 + (stg * lead_chars if lead_chars else 0), 3)
        js.append(f'tl.fromTo("#{bid} .part-hero",{{{FROM[dh]}}},{{x:0,y:0,scale:1,opacity:1,duration:0.45,ease:"smooth"}},{th});')
    if s and i == s['first'] and not s['cutout'] and s['kind'] in ('pop', 'grow'):
        js.append(f'tl.fromTo("#s{segs.index(s):02d} .inner",{{y:90}},{{y:0,duration:0.25,ease:"smooth"}},{b["start"] + 0.05:.3f});')

# outro: vinyl + title return for a seamless loop
last = beats[-1]
st = round(last['end'] + 0.15, 3)
for k2, s2 in enumerate(segs):
    if s2['last'] == len(beats) - 1:
        old = f'id="s{k2:02d}" class="clip seg" data-start="'
        for j, h2 in enumerate(out_html):
            if h2.startswith('<div ' + old):
                a0 = float(h2.split('data-start="')[1].split('"')[0])
                d0 = h2.split('data-duration="')[1].split('"')[0]
                out_html[j] = h2.replace(f'data-duration="{d0}"', f'data-duration="{round(st - a0, 3)}"', 1)
d = round(TOTAL - st, 3)
out_html.append(
    f'<div id="outro" class="clip" data-start="{st}" data-duration="{d}" data-track-index="5">'
    f'<div class="tinner" style="top:{CARD_CY - 300}px"><div class="block center"><div class="vstage"><div class="vmove">{vinyl_html(600)}</div><div class="sleeve"></div></div>'
    f'<div class="flow title-flow" style="margin-top:46px">{word_spans("Like a Tattoo,", "k it")} {word_spans("de Sade ?")}</div></div></div></div>')
js.append(f'tl.fromTo("#outro .block",{{scale:0}},{{scale:1.06,duration:0.3,ease:"back.out(1.6)"}},{st});')
js.append(f'tl.to("#outro .block",{{scale:1,duration:0.18,ease:"smooth"}},{st + 0.3:.3f});')
E = TOTAL
js.append(f'tl.set("#outro .sleeve",{{x:-1000,rotation:-16,opacity:0}},{st});')
js.append(f'tl.to("#outro .sleeve",{{x:-220,rotation:-4,opacity:1,duration:0.5,ease:"smooth"}},{E - 1.55:.3f});')
js.append(f'tl.to("#outro .vmove",{{x:220,duration:0.45,ease:"inout"}},{E - 1.55:.3f});')
js.append(f'tl.to("#outro .title-flow",{{y:-30,opacity:0,filter:"blur(10px)",duration:0.4,ease:"inquick"}},{E - 1.55:.3f});')
js.append(f'tl.to("#outro .vmove",{{x:0,duration:0.42,ease:"inquick"}},{E - 1.0:.3f});')
js.append(f'tl.to("#outro .sleeve",{{x:0,rotation:0,duration:0.42,ease:"inquick"}},{E - 1.0:.3f});')
js.append(f'tl.to("#outro .vstage",{{scale:0,duration:0.3,ease:"inquick"}},{E - 0.45:.3f});')
js.append(f'tl.fromTo("#outro .spin",{{rotation:0}},{{rotation:{round(160 * d)},duration:{d},ease:"none"}},{st});')

page = f'''<!doctype html>
<html lang="fr" data-resolution="portrait">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=1080, height=1920" />
<script src="assets/gsap.min.js"></script>
<script src="assets/CustomEase.min.js"></script>
<style>
@font-face {{ font-family:"Kaneda"; font-weight:300; src:url("assets/fonts/Kaneda-Light.otf") format("opentype"); }}
@font-face {{ font-family:"Kaneda"; font-weight:400; src:url("assets/fonts/Kaneda-Regular.otf") format("opentype"); }}
@font-face {{ font-family:"Kaneda"; font-weight:500; src:url("assets/fonts/Kaneda-Medium.otf") format("opentype"); }}
@font-face {{ font-family:"Kaneda"; font-weight:700; src:url("assets/fonts/Kaneda-Bold.otf") format("opentype"); }}
@font-face {{ font-family:"Kaneda"; font-weight:800; src:url("assets/fonts/Kaneda-ExtraBold.otf") format("opentype"); }}
@font-face {{ font-family:"Kaneda"; font-weight:900; src:url("assets/fonts/Kaneda-Black.otf") format("opentype"); }}
@font-face {{ font-family:"Kaneda"; font-weight:300; font-style:italic; src:url("assets/fonts/Kaneda-LightItalic.otf") format("opentype"); }}
@font-face {{ font-family:"Kaneda"; font-weight:400; font-style:italic; src:url("assets/fonts/Kaneda-RegularItalic.otf") format("opentype"); }}
@font-face {{ font-family:"Kaneda"; font-weight:700; font-style:italic; src:url("assets/fonts/Kaneda-BoldItalic.otf") format("opentype"); }}
@font-face {{ font-family:"Kaneda"; font-weight:900; font-style:italic; src:url("assets/fonts/Kaneda-BlackItalic.otf") format("opentype"); }}
:root {{ --ground:#ffffff; --ink:#111111; --muted:#c8c8c8; }}
* {{ margin:0; padding:0; box-sizing:border-box; }}
html, body {{ width:1080px; height:1920px; overflow:hidden; background:var(--ground); }}
#root {{ width:1080px; height:1920px; position:relative; background:var(--ground); color:var(--ink); }}
.seg, .txt, #outro {{ position:absolute; inset:0; }}
.inner {{ position:absolute; transform-origin:50% 50%; }}
.card {{ width:100%; height:100%; border-radius:50px; overflow:hidden; }}
.card img, .cut img {{ transform-origin:50% 50%; }}
.card img {{ width:100%; height:100%; object-fit:cover; display:block; }}
.cut img {{ width:100%; height:100%; object-fit:contain; display:block; }}
.tinner {{ position:absolute; left:0; width:1080px; display:flex; justify-content:center; }}
.block {{ max-width:900px; text-align:left; transform-origin:50% 0%; }}
.block.center {{ text-align:center; display:flex; flex-direction:column; align-items:center; }}
.light {{ font-family:"Kaneda"; font-weight:300; font-size:80px; line-height:1.0; }}
.bold {{ font-family:"Kaneda"; font-weight:700; font-size:78px; line-height:1.0; }}
.hero {{ font-family:"Kaneda"; font-weight:900; font-size:196px; line-height:0.86; }}
.row {{ display:flex; align-items:baseline; gap:0 22px; flex-wrap:wrap; }}
.row .light, .row .hero {{ display:inline-block; }}
.title {{ font-family:"Kaneda"; font-weight:300; font-size:120px; line-height:1.0; text-align:center; }}
.script {{ font-family:"Playfair Display"; font-style:italic; font-weight:700; font-size:66px; text-align:center; }}
.flow {{ font-family:"Kaneda"; font-weight:400; font-size:68px; line-height:1.05; text-align:center; max-width:820px; }}
.flow .k {{ font-weight:900; }}
.title-flow {{ font-size:104px; }}
.kin {{ position:absolute; transform-origin:50% 50%; font-family:"Kaneda"; color:#111; }}
.kl {{ line-height:0.9; white-space:nowrap; text-align:center; transform-origin:50% 50%; }}
.vinyl {{ position:relative; }}
.spin, .disc, .label, .hole, .shine {{ position:absolute; border-radius:50%; }}
.spin {{ inset:0; }}
.disc {{ inset:0; background:repeating-radial-gradient(circle at 50% 50%, #151515 0px, #151515 3px, #232323 4px, #151515 6px); }}
.label {{ left:31%; top:31%; width:38%; height:38%; background-size:cover; background-position:center; }}
.hole {{ left:48.6%; top:48.6%; width:2.8%; height:2.8%; background:#fff; }}
.shine {{ inset:0; background:conic-gradient(from 30deg, rgba(255,255,255,0) 0deg, rgba(255,255,255,.14) 25deg, rgba(255,255,255,0) 60deg, rgba(255,255,255,0) 180deg, rgba(255,255,255,.12) 205deg, rgba(255,255,255,0) 240deg); }}
.it {{ font-style:italic; }}
.vstage {{ position:relative; width:600px; height:600px; }}
.vmove {{ position:absolute; inset:0; }}
.sleeve {{ position:absolute; inset:0; border-radius:18px; background:url(assets/img/cover-sleeve.jpg) center/cover; box-shadow:0 30px 60px rgba(0,0,0,.18); opacity:0; }}
.inner .vinyl {{ box-shadow:0 30px 60px rgba(0,0,0,.2); border-radius:50%; }}
.w {{ display:inline-block; white-space:nowrap; }}
</style>
</head>
<body>
<div id="root" data-composition-id="main" data-start="0" data-duration="{TOTAL}" data-width="1080" data-height="1920" data-layout-allow-overlap>
<audio id="vo" src="assets/voice.wav" data-start="0" data-duration="{TOTAL}"></audio>
{chr(10).join(out_html)}
</div>
<script>
gsap.registerPlugin(CustomEase);
CustomEase.create("smooth", "0.22,1,0.36,1");
CustomEase.create("inout", "0.65,0,0.35,1");
CustomEase.create("inquick", "0.55,0,1,0.45");
const tl = gsap.timeline({{ paused: true }});
{chr(10).join(js)}
window.__timelines["main"] = tl;
tl.seek(0);
</script>
</body>
</html>
'''
open(os.path.join(P, 'index.html'), 'w', encoding='utf-8').write(page)
print('ok', TOTAL, len(segs), 'segments')
