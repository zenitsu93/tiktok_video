"use client";

import { Check, Copy, RotateCcw } from "lucide-react";
import { useState } from "react";
import type { VideoView } from "@/lib/view";
import { Disc } from "./waits";

/**
 * Copies the caption. Thomas posts from his phone, so it is also on each line of the
 * home screen: copy there, then paste in TikTok while adding the sound.
 */
export function CopyCaption({ text, label = "Copier" }: { text: string; label?: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  async function copy() {
    const ok = await navigator.clipboard.writeText(text).then(
      () => true,
      () => false,
    );
    setState(ok ? "copied" : "failed");
    setTimeout(() => setState("idle"), 2000);
  }
  return (
    <button className="btn sm" onClick={copy} title={state === "failed" ? "Copie impossible : sélectionne le texte à la main" : text}>
      {state === "copied" ? <Check size={14} /> : <Copy size={14} />} {state === "copied" ? "Copiée" : state === "failed" ? "Copie impossible" : label}
    </button>
  );
}

/**
 * The TikTok caption, under the preview. The send to TikTok carries no text (the inbox
 * takes the file only), so Thomas copies it and pastes it when he adds the sound.
 */
export function Caption({ v, write }: { v: VideoView; write: () => void }) {
  if (!v.beats.length) return null;
  const writing = v.busy.includes("caption");

  return (
    <section className="panel">
      <div className="r" style={{ alignItems: "center" }}>
        <b>Légende TikTok</b>
        <span style={{ display: "flex", gap: 6 }}>
          {v.caption && !writing && <CopyCaption text={v.caption} />}
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
