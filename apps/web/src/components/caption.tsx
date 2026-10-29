"use client";

import { Check, Copy, RotateCcw } from "lucide-react";
import { useState } from "react";
import type { VideoView } from "@/lib/view";
import { Disc } from "./waits";

/**
 * The TikTok caption, under the preview. The send to TikTok carries no text (the inbox
 * takes the file only), so Thomas copies it here and pastes it when he adds the sound.
 */
export function Caption({ v, write, flash }: { v: VideoView; write: () => void; flash: (text: string, err?: boolean) => void }) {
  const [copied, setCopied] = useState(false);
  if (!v.beats.length) return null;
  const writing = v.busy.includes("caption");

  async function copy() {
    try {
      await navigator.clipboard.writeText(v.caption ?? "");
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      flash("Copie impossible : sélectionne le texte à la main.", true);
    }
  }

  return (
    <section className="panel">
      <div className="r" style={{ alignItems: "center" }}>
        <b>Légende TikTok</b>
        <span style={{ display: "flex", gap: 6 }}>
          {v.caption && (
            <button className="btn sm" onClick={copy} disabled={writing}>
              {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Copiée" : "Copier"}
            </button>
          )}
          <button className="btn ghost sm" onClick={write} disabled={writing} title="Claude l'écrit à partir du script tel qu'il est maintenant">
            {writing ? <Disc size={14} /> : <RotateCcw size={14} />} {writing ? "Écriture…" : v.caption ? "Réécrire" : "Écrire la légende"}
          </button>
        </span>
      </div>
      {v.caption ? (
        <p style={{ margin: 0, whiteSpace: "pre-wrap", overflowWrap: "anywhere", userSelect: "text" }}>{v.caption}</p>
      ) : (
        !writing && (
          <p className="mute" style={{ margin: 0 }}>
            Pas encore de légende.
          </p>
        )
      )}
    </section>
  );
}
