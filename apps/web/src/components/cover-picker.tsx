"use client";

import { Disc3, ImagePlus, Loader2, Search } from "lucide-react";
import { useState } from "react";
import type { VideoView } from "@/lib/view";
import type { Notify } from "./pronunciations";

const TYPES = "image/jpeg,image/png,image/webp,image/avif";

/**
 * « Pochette », in the sheet of the record's lines (the first and the last): the video's cover is the
 * opening « bac à disques » (also the TikTok cover), the record's label and the ending loop.
 * Other sleeves from Deezer (free) or Pinterest (the same Apify search as the images), or Thomas's own file.
 */
export function CoverPicker({ v, notify }: { v: VideoView; notify: Notify }) {
  const busy = v.busy.includes("cover");
  const [sent, setSent] = useState<"deezer" | "pinterest" | "upload" | null>(null);
  const [drag, setDrag] = useState(false);
  const working = busy || sent !== null;
  const current = v.cover ? v.images[v.cover] : undefined;

  async function send(init: RequestInit, kind: "deezer" | "pinterest" | "upload", ok: string) {
    setSent(kind);
    try {
      const r = await fetch(`/api/videos/${v.id}/cover`, { method: init.method ?? "POST", ...init });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error ?? `Erreur ${r.status}`);
      notify.flash(ok);
      notify.onChange();
    } catch (e) {
      notify.flash(e instanceof Error ? e.message : "Impossible pour l'instant", true);
    } finally {
      // the worker takes over: its « busy » mark keeps the spinner until the sleeves are in
      setTimeout(() => setSent(null), 2500);
    }
  }
  const search = (source: "deezer" | "pinterest") =>
    send(
      { headers: { "content-type": "application/json" }, body: JSON.stringify({ source }) },
      source,
      source === "deezer" ? "Deezer cherche d'autres pochettes…" : "Pinterest cherche des pochettes…",
    );
  const upload = (f: File) => {
    if (f.size > 9_500_000) return notify.flash("Fichier trop lourd (9 Mo au plus).", true);
    if (!TYPES.split(",").includes(f.type)) return notify.flash("Choisis une image (JPEG, PNG ou WebP) pour la pochette.", true);
    void send({ headers: { "content-type": f.type }, body: f }, "upload", "Ta pochette arrive au début et à la fin");
  };
  async function pick(id: string) {
    if (id === v.cover || working) return;
    try {
      const r = await fetch(`/api/videos/${v.id}/cover`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ cover: id }) });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error ?? `Erreur ${r.status}`);
      notify.flash("Pochette changée, au début et à la fin");
      notify.onChange();
    } catch (e) {
      notify.flash(e instanceof Error ? e.message : "Impossible pour l'instant", true);
    }
  }

  return (
    <div
      className={`grp cover-pick${drag ? " drop" : ""}`}
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
        if (f) upload(f);
      }}
    >
      <div className="cover-hd">
        <span className="cover-now" style={current ? { backgroundImage: `url(${current.url})` } : undefined}>
          {!current && <Disc3 size={22} className="mute" />}
          {working && <span className="shimmer" aria-hidden="true" />}
        </span>
        <span>
          <span className="lab">Pochette · début et fin de la vidéo</span>
          <span className="mute" style={{ display: "block", fontSize: 13 }}>
            Elle fait le bac à disques de l&apos;intro (la couverture TikTok), le disque, et la boucle de fin.
          </span>
        </span>
      </div>
      {v.covers.length > 1 && (
        <div className="cands covers" role="group" aria-label="Pochettes trouvées">
          {v.covers.map((c) => {
            const img = v.images[c];
            if (!img) return null;
            return (
              <button key={c} aria-pressed={c === v.cover} onClick={() => void pick(c)} disabled={working} aria-label={c === v.cover ? "Pochette actuelle" : "Mettre cette pochette"}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.url} alt="" loading="lazy" />
              </button>
            );
          })}
        </div>
      )}
      <div className="chips">
        <button className="btn sm" disabled={working} onClick={() => void search("deezer")} title="D'autres albums, singles et rééditions de la chanson (gratuit)">
          {sent === "deezer" || (busy && sent === null) ? <Loader2 size={14} className="spin" /> : <Disc3 size={14} />} Autres pochettes
        </button>
        {v.providers.images && (
          <button className="btn sm" disabled={working} onClick={() => void search("pinterest")} title="La même recherche Pinterest que pour les images (quelques centimes)">
            {sent === "pinterest" ? <Loader2 size={14} className="spin" /> : <Search size={14} />} Chercher sur Pinterest
          </button>
        )}
        <label className={`btn sm${working ? " off" : ""}`} title="Ta propre image de pochette, depuis ton ordinateur ou ton téléphone (ou glisse-la ici)">
          {sent === "upload" ? <Loader2 size={14} className="spin" /> : <ImagePlus size={14} />} Ma pochette
          <input
            type="file"
            accept={TYPES}
            hidden
            disabled={working}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) upload(f);
            }}
          />
        </label>
      </div>
      {v.covers.length > 1 && <span className="mute" style={{ fontSize: 13 }}>Un clic sur une pochette la met au début et à la fin.</span>}
    </div>
  );
}
