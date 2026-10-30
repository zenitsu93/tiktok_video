"use client";

import { Check, ExternalLink, ImagePlus, Loader2, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { BeatView, VideoView } from "@/lib/view";
import type { Notify } from "./pronunciations";

/** One idea: the lines that share the same searches (the Régie gives them one picture between them). */
interface Idea {
  key: string;
  beats: BeatView[];
  /** The lines of the idea that show a picture (the text-only ones keep their layout). */
  need: BeatView[];
  queries: string[];
  cover: boolean;
}

const needsImage = (b: BeatView) => b.layout === "card" || b.layout === "cutout";
const pinterest = (q: string) => `https://www.pinterest.com/search/pins/?q=${encodeURIComponent(q)}`;

/** Same grouping as the pipeline's image search: consecutive lines with the same queries. */
function ideasOf(beats: BeatView[]): Idea[] {
  const out: Idea[] = [];
  beats.forEach((b, i) => {
    const prev = beats[i - 1];
    const last = out.at(-1);
    if (last && prev && b.queryKind !== "none" && prev.queryKind === b.queryKind && prev.queries.join() === b.queries.join()) last.beats.push(b);
    else out.push({ key: b.id, beats: [b], need: [], queries: b.queries, cover: b.queryKind === "cover" });
  });
  for (const idea of out) {
    idea.need = idea.beats.filter(needsImage);
    // a line without a search of its own: its own words make the search
    if (!idea.queries.length)
      idea.queries = [
        idea.beats
          .map((b) => b.hero || b.text)
          .join(" ")
          .slice(0, 80),
      ];
  }
  return out.filter((i) => i.need.length);
}

/** The picture from the clipboard (« Copier l'image » in the browser), when there is one. */
function pasted(e: ClipboardEvent): File | null {
  for (const item of e.clipboardData?.items ?? []) {
    if (item.kind === "file" && (item.type.startsWith("image/") || item.type.startsWith("video/"))) return item.getAsFile();
  }
  return null;
}

/**
 * La Planche: « je cherche moi-même ». One tile per idea, with its Pinterest searches ready;
 * Ctrl+V puts the copied picture on the tile that is lit, then the next empty one lights up.
 * Free: no Apify search, the picture goes the « Ma photo » way.
 */
export function Planche({ v, notify, onSearch }: { v: VideoView; notify: Notify; onSearch: (beatId: string) => void }) {
  const ideas = useMemo(() => ideasOf(v.beats), [v.beats]);
  const filled = (i: Idea) => i.need.every((b) => b.image);
  const [sent, setSent] = useState<Record<string, number>>({});
  const waiting = (i: Idea) => (sent[i.key] ?? 0) > Date.now() - 60_000 && !filled(i);
  const busy = (i: Idea) => waiting(i) || i.need.some((b) => v.busy.includes(b.id));
  const firstOpen = ideas.find((i) => !filled(i) && !busy(i))?.key ?? null;
  const [active, setActive] = useState<string | null>(firstOpen);
  const lit = ideas.some((i) => i.key === active) ? active : firstOpen;
  const done = ideas.filter(filled).length;
  const left = ideas.filter((i) => !filled(i));

  async function upload(idea: Idea, f: File) {
    if (!f.type.startsWith("image/") && !f.type.startsWith("video/")) return notify.flash("Ce n'est ni une image, ni un GIF, ni une vidéo.", true);
    if (f.size > 9_500_000) return notify.flash("Fichier trop lourd (9 Mo au plus).", true);
    const [first, ...also] = idea.need;
    setSent((s) => ({ ...s, [idea.key]: Date.now() }));
    // the next empty idea lights up straight away: no waiting for the worker
    const next = ideas.find((i) => i.key !== idea.key && !filled(i) && !busy(i));
    setActive(next?.key ?? null);
    try {
      const q = also.length ? `?also=${also.map((b) => b.id).join(",")}` : "";
      const r = await fetch(`/api/videos/${v.id}/beats/${first!.id}/image${q}`, { method: "POST", headers: { "content-type": f.type || "image/png" }, body: f });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error ?? `Erreur ${r.status}`);
      notify.onChange();
    } catch (e) {
      setSent((s) => ({ ...s, [idea.key]: 0 }));
      setActive(idea.key);
      notify.flash(e instanceof Error ? e.message : "Envoi impossible", true);
    }
  }

  // Ctrl+V anywhere on the page goes to the lit tile (not while typing in a field)
  useEffect(() => {
    const on = (e: ClipboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      const f = pasted(e);
      const idea = ideas.find((i) => i.key === lit);
      if (!f) return;
      e.preventDefault();
      if (!idea) return notify.flash("Toutes les idées ont leur image. Clique une case pour la changer.");
      void upload(idea, f);
    };
    window.addEventListener("paste", on);
    return () => window.removeEventListener("paste", on);
  });

  // several tabs from one click: browsers let the first through, then ask once to allow pop-ups
  const openLeft = () => left.slice(0, 8).forEach((i) => window.open(pinterest(i.queries[0]!), "_blank", "noopener"));

  if (!ideas.length) return <p className="mute">Aucun plan n&apos;attend d&apos;image : toutes les lignes sont en texte seul.</p>;

  return (
    <section className="planche" aria-label="La Planche : une image par idée">
      <div className="planche-bar">
        <span className="planche-count">
          {done}
          <small>/{ideas.length} idées</small>
        </span>
        <div className="planche-prog" aria-hidden="true">
          <i style={{ width: `${(done / ideas.length) * 100}%` }} />
        </div>
        {left.length > 1 && (
          <button className="btn sm" onClick={openLeft} title="Ouvre un onglet Pinterest par idée sans image (8 au plus)">
            <ExternalLink size={14} /> Ouvrir les {Math.min(left.length, 8)} restantes
          </button>
        )}
      </div>
      <p className="mute planche-help">
        « Pinterest » ouvre la recherche toute prête. Clic droit sur l&apos;image, « Copier l&apos;image », puis <kbd>Ctrl</kbd>+<kbd>V</kbd> ici : elle va dans la case rouge et la suivante
        s&apos;allume. Tu peux aussi glisser un fichier sur une case, ou la toucher pour choisir une photo. Un GIF ou une courte vidéo marche aussi :
        enregistre-le, puis glisse-le dans la case (il joue en boucle, sans le son).
      </p>
      <div className="planche-grid">
        {ideas.map((idea) => (
          <Tile
            key={idea.key}
            idea={idea}
            v={v}
            lit={idea.key === lit}
            busy={busy(idea)}
            filled={filled(idea)}
            onLight={() => setActive(idea.key)}
            onFile={(f) => void upload(idea, f)}
            onSearch={() => onSearch(idea.need[0]!.id)}
            notify={notify}
          />
        ))}
      </div>
    </section>
  );
}

function Tile({
  idea,
  v,
  lit,
  busy,
  filled,
  onLight,
  onFile,
  onSearch,
  notify,
}: {
  idea: Idea;
  v: VideoView;
  lit: boolean;
  busy: boolean;
  filled: boolean;
  onLight: () => void;
  onFile: (f: File) => void;
  onSearch: () => void;
  notify: Notify;
}) {
  const [drag, setDrag] = useState(false);
  const shown = idea.need.find((b) => b.image)?.image;
  const img = shown ? v.images[shown] : undefined;
  // pictures the Régie found for this idea (« La Régie cherche »), to give to all its lines
  const first = idea.need[0]!;
  const cands = first.candidates.filter((c) => (!filled || c !== shown) && v.images[c]).slice(0, 4);
  const ids = idea.beats.map((b) => b.id.replace(/^b/, "")).join(" · ");
  const give = async (image: string) => {
    try {
      for (const b of idea.need) {
        const r = await fetch(`/api/videos/${v.id}/beats/${b.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image }) });
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `Erreur ${r.status}`);
      }
      notify.onChange();
    } catch (e) {
      notify.flash(e instanceof Error ? e.message : "Impossible", true);
    }
  };

  return (
    <div
      className={`tile${lit ? " lit" : ""}${filled ? " done" : ""}${drag ? " drop" : ""}`}
      onClick={onLight}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) {
          e.preventDefault();
          setDrag(true);
        }
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        const f = e.dataTransfer.files[0];
        if (f) onFile(f);
      }}
    >
      <div className="tile-id">
        <span className="mono">{ids}</span>
        {filled && !busy && <Check size={15} className="ok-ic" aria-label="Image posée" />}
        {idea.cover && (
          <span className="mute" style={{ fontSize: 12 }}>
            pochette
          </span>
        )}
      </div>
      <label className="tile-slot" title="Choisir une image sur cet appareil">
        {busy ? (
          <span className="tile-wait">
            <Loader2 size={18} className="spin" /> L&apos;image arrive…
          </span>
        ) : img?.clip ? (
          <video src={img.clip} poster={img.url} muted loop autoPlay playsInline />
        ) : img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img.url} alt="" loading="lazy" />
        ) : lit ? (
          <span>
            <b>Ctrl+V</b> pour coller
            <br />
            ou glisse l&apos;image
          </span>
        ) : (
          <span>
            <ImagePlus size={18} />
          </span>
        )}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,video/webm"
          hidden
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) onFile(f);
          }}
        />
      </label>
      <p className="tile-text">{idea.beats.map((b) => b.text).join(" ")}</p>
      {cands.length > 0 && (
        <div className="tile-cands" aria-label="Images trouvées par la Régie">
          {cands.map((c) => (
            <button key={c} onClick={() => void give(c)} aria-label="Prendre cette image">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={v.images[c]!.url} alt="" loading="lazy" />
            </button>
          ))}
        </div>
      )}
      <div className="tile-kws">
        {idea.queries.map((q) => (
          <a key={q} className="tile-pin" href={pinterest(q)} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} title={`Chercher « ${q} » sur Pinterest`}>
            <ExternalLink size={12} /> <span>{q}</span>
          </a>
        ))}
      </div>
      {!idea.cover && !filled && !busy && (
        <button
          className="btn ghost sm tile-auto"
          disabled={!v.providers.images}
          title={v.providers.images ? "Recherche Pinterest payante (Apify, quelques centimes) pour cette idée seulement" : "La recherche automatique n'est pas configurée"}
          onClick={(e) => {
            e.stopPropagation();
            onSearch();
          }}
        >
          <Search size={13} /> La Régie cherche
        </button>
      )}
    </div>
  );
}
