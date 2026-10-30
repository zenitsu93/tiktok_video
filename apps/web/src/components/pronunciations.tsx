"use client";

import { Plus, X } from "lucide-react";
import { useState } from "react";
import type { VideoView } from "@/lib/view";

const small: React.CSSProperties = { flex: 1, minWidth: 0, fontSize: 14, padding: "7px 10px", borderRadius: 9 };

/**
 * Words the voice must say otherwise than they are written: « Sade » on screen, « Chadé »
 * in the voice. Shared by every video; the lines of this one are voiced again at once.
 */
export function Pronunciations({ v, onChange, flash }: { v: VideoView; onChange: () => void; flash: (text: string, err?: boolean) => void }) {
  const [word, setWord] = useState("");
  const [say, setSay] = useState("");
  const [busy, setBusy] = useState(false);

  async function send(method: "POST" | "DELETE", payload: { word: string; say?: string }) {
    setBusy(true);
    try {
      const r = await fetch("/api/pronunciations", {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...payload, videoId: v.id }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error ?? `Erreur ${r.status}`);
      const n: number = data.revoiced ?? 0;
      const done = method === "POST" ? `« ${payload.word} » se dira « ${payload.say} »` : `« ${payload.word} » se lit de nouveau tel quel`;
      flash(n ? `${done} · voix refaite sur ${n} ${n > 1 ? "lignes" : "ligne"}` : done);
      if (method === "POST") {
        setWord("");
        setSay("");
      }
      onChange();
    } catch (e) {
      flash(e instanceof Error ? e.message : "Ça n'a pas marché, réessaie.", true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="panel" open={v.pronunciations.length > 0 || undefined}>
      <summary>Prononciation ({v.pronunciations.length})</summary>
      <p className="mute" style={{ margin: 0, fontSize: 13 }}>
        À l&apos;écran, le mot reste écrit comme à gauche. La voix le dit comme à droite. Vaut pour toutes les vidéos.
      </p>
      {v.pronunciations.map((p) => (
        <div key={p.word} className="r" style={{ alignItems: "center" }}>
          <span>
            <b>{p.word}</b> → {p.say}
          </span>
          <button className="btn ghost sm" onClick={() => send("DELETE", { word: p.word })} disabled={busy} aria-label={`Retirer ${p.word}`} title="Retirer">
            <X size={14} />
          </button>
        </div>
      ))}
      <form
        style={{ display: "flex", gap: 6, alignItems: "center" }}
        onSubmit={(e) => {
          e.preventDefault();
          if (word.trim() && say.trim()) void send("POST", { word: word.trim(), say: say.trim() });
        }}
      >
        <input className="field" style={small} value={word} onChange={(e) => setWord(e.target.value)} placeholder="Sade" aria-label="Le mot, écrit" maxLength={60} />
        <input className="field" style={small} value={say} onChange={(e) => setSay(e.target.value)} placeholder="Chadé" aria-label="Comment la voix le dit" maxLength={120} />
        <button className="btn sm" type="submit" disabled={busy || !word.trim() || !say.trim()} aria-label="Ajouter">
          <Plus size={14} />
        </button>
      </form>
    </details>
  );
}
