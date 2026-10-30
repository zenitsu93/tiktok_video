"use client";

import { searchLibrary } from "@regie/core";
import { Loader2, Play, Search, Trash2 } from "lucide-react";
import { useState } from "react";
import type { LibraryItem } from "@/lib/library";

/** The library page's grid: search as you type, and take a picture out (two clicks, the second confirms). */
export function Shelf({ initial }: { initial: LibraryItem[] }) {
  const [items, setItems] = useState(initial);
  const [q, setQ] = useState("");
  const [armed, setArmed] = useState<string | null>(null);
  const [gone, setGone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const shown = q.trim() ? searchLibrary(items, q, 500) : items;

  async function remove(id: string) {
    setGone(id);
    setError(null);
    try {
      const r = await fetch(`/api/library/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `Erreur ${r.status}`);
      setItems((all) => all.filter((i) => i.assetId !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Impossible de la retirer.");
    } finally {
      setGone(null);
      setArmed(null);
    }
  }

  if (!items.length)
    return <p className="mute">Rien pour l&apos;instant. Monte une vidéo : les images de ses plans arrivent ici, prêtes pour les suivantes.</p>;

  return (
    <section className="shelf page">
      <div className="shelf-q">
        <Search size={15} aria-hidden="true" />
        <input id="shelf-page" value={q} onChange={(e) => setQ(e.target.value)} placeholder="micro, platine, foule, Michael Jackson…" aria-label="Chercher dans ta bibliothèque" />
        <span className="mono mute">{shown.length}</span>
      </div>
      {error && <p style={{ color: "var(--accent)", margin: 0 }}>{error}</p>}
      {!shown.length ? (
        <p className="mute shelf-note">Rien pour « {q.trim()} ». Essaie un autre mot, en français ou en anglais.</p>
      ) : (
        <div className="shelf-grid">
          {shown.map((i) => (
            <figure key={i.assetId} className={`shelf-card${i.cut ? " cut" : ""}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {i.clip ? <video src={i.clip} poster={i.url} muted loop autoPlay playsInline /> : <img src={i.url} alt="" loading="lazy" />}
              {i.clip && (
                <span className="clipmark" aria-label="GIF ou vidéo">
                  <Play size={10} />
                </span>
              )}
              <figcaption>
                <b>{i.label}</b>
                <span className="mute">
                  {i.uses > 1 ? `${i.uses} vidéos · ` : ""}
                  {i.text}
                </span>
              </figcaption>
              <button
                className={`btn sm shelf-del${armed === i.assetId ? " armed" : ""}`}
                disabled={gone === i.assetId}
                onClick={() => (armed === i.assetId ? void remove(i.assetId) : setArmed(i.assetId))}
                onBlur={() => armed === i.assetId && setArmed(null)}
                aria-label={armed === i.assetId ? "Confirmer : retirer de la bibliothèque" : "Retirer de la bibliothèque"}
              >
                {gone === i.assetId ? <Loader2 size={13} className="spin" /> : <Trash2 size={13} />}
                {armed === i.assetId ? "Retirer ?" : null}
              </button>
            </figure>
          ))}
        </div>
      )}
    </section>
  );
}
