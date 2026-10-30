"use client";

import { Check, ExternalLink, ImagePlus, Library, Loader2, Search, Wand2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { LibraryItem } from "@/lib/library";
import type { BeatView, VideoView } from "@/lib/view";
import { bestFromShelf, ideaSuggestions, putFromShelf, ShelfSearch, ShelfThumb, useLibrary } from "./library";
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
  const shelfItems = useLibrary();
  const [shelf, setShelf] = useState(false);
  const litIdea = ideas.find((i) => i.key === lit);
  const [filling, setFilling] = useState(false);

  /** « Chercher dans ma bibliothèque » : the picture that fits this idea goes on it, or nothing does. */
  async function fromShelf(idea: Idea) {
    const best = bestFromShelf(shelfItems, v, idea.queries);
    if (!best) return notify.flash("Rien dans ta bibliothèque pour cette idée.");
    await putFromShelf(v, idea.need.map((b) => b.id), best, notify);
  }

  /** The same for every empty tile, one picture per idea, never the same one twice. */
  async function fillFromShelf() {
    setFilling(true);
    const taken = new Set<string>();
    let put = 0;
    for (const idea of left) {
      if (busy(idea)) continue;
      const best = bestFromShelf(shelfItems, v, idea.queries, taken);
      if (!best) continue;
      taken.add(best.assetId);
      if (await putFromShelf(v, idea.need.map((b) => b.id), best, notify, true)) put++;
    }
    setFilling(false);
    notify.onChange();
    const rest = left.length - put;
    notify.flash(
      put
        ? `${put} ${put > 1 ? "cases remplies" : "case remplie"} depuis ta bibliothèque${rest ? `, ${rest} sans image qui va` : ""}.`
        : "Rien dans ta bibliothèque ne va avec les cases vides.",
    );
  }

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
        {Boolean(shelfItems?.length) && left.length > 0 && (
          <button
            className="btn sm"
            disabled={filling}
            onClick={() => void fillFromShelf()}
            title="Pour chaque case vide, la Régie cherche dans tes images gardées et pose celle qui va, sinon elle laisse vide. Gratuit."
          >
            {filling ? <Loader2 size={14} className="spin" /> : <Wand2 size={14} />} Remplir depuis ma bibliothèque
          </button>
        )}
        {Boolean(shelfItems?.length) && (
          <button className="btn sm" aria-expanded={shelf} onClick={() => setShelf((o) => !o)} title="Les images gardées sur tes autres vidéos : gratuit">
            <Library size={14} /> Bibliothèque · {shelfItems!.length}
          </button>
        )}
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
      {shelf && (
        <ShelfSearch
          v={v}
          beatIds={litIdea ? litIdea.need.map((b) => b.id) : []}
          queries={litIdea?.queries ?? []}
          notify={notify}
          onClose={() => setShelf(false)}
          target={litIdea ? `la case ${litIdea.beats.map((b) => b.id.replace(/^b/, "")).join(" · ")}` : undefined}
        />
      )}
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
            onShelf={shelfItems?.length ? () => void fromShelf(idea) : undefined}
            notify={notify}
            mine={filled(idea) ? [] : ideaSuggestions(shelfItems, v, idea.queries, 4)}
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
  onShelf,
  notify,
  mine,
}: {
  idea: Idea;
  v: VideoView;
  lit: boolean;
  busy: boolean;
  filled: boolean;
  onLight: () => void;
  onFile: (f: File) => void;
  onSearch: () => void;
  /** « Ma bibliothèque » : the picture that fits, or a message that none does. */
  onShelf?: () => void;
  notify: Notify;
  /** Pictures from the library that fit this idea: a click and it is done, for free. */
  mine: LibraryItem[];
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
      {mine.length > 0 && !busy && (
        <div className="tile-mine" aria-label="Dans ta bibliothèque">
          <span className="minemark">À toi</span>
          <div className="tile-cands">
            {mine.map((m) => (
              <ShelfThumb key={m.assetId} item={m} small onPick={() => void putFromShelf(v, idea.need.map((b) => b.id), m, notify)} />
            ))}
          </div>
        </div>
      )}
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
      {!idea.cover && !filled && !busy && onShelf && (
        <button
          className="btn ghost sm tile-auto"
          title="Cherche dans tes images gardées et pose celle qui va avec cette idée, sinon rien. Gratuit."
          onClick={(e) => {
            e.stopPropagation();
            onShelf();
          }}
        >
          <Library size={13} /> Ma bibliothèque
        </button>
      )}
    </div>
  );
}
