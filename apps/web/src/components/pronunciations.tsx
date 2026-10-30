"use client";

import { X } from "lucide-react";
import { useState } from "react";
import type { BeatView, VideoView } from "@/lib/view";

export type Notify = { flash: (text: string, err?: boolean) => void; onChange: () => void };

const norm = (s: string) => s.toLocaleLowerCase("fr");
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// same word edges as spokenText in @regie/core
const found = (text: string, word: string) => new RegExp(`(?<![\\p{L}\\p{N}])${escape(word)}(?![\\p{L}\\p{N}])`, "iu").test(text);
const countIn = (v: VideoView, word: string) => v.beats.filter((b) => found(b.text, word)).length;

/**
 * Pronunciation, on the word itself: a click on a word of the line opens a bubble that says
 * how the voice reads it. A word with a rule shows its reading above it. A rule is shared by
 * every video and every occurrence; the lines of this video are voiced again at once.
 */
export function PronounceWords({ b, v, words, notify }: { b: BeatView; v: VideoView; words: string[]; notify: Notify }) {
  const [open, setOpen] = useState<{ word: string; say: string; known: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const ruleOf = (w: string) => v.pronunciations.find((p) => norm(p.word) === norm(w));
  // rules of several words (« Sade Adu ») that this line contains
  const phrases = v.pronunciations.filter((p) => /\s/.test(p.word.trim()) && found(b.text, p.word));

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
      const done = method === "POST" ? `« ${payload.word} » se dira « ${payload.say} » partout` : `« ${payload.word} » se lit de nouveau tel quel`;
      notify.flash(n ? `${done} · voix refaite sur ${n} ${n > 1 ? "lignes" : "ligne"}` : done);
      setOpen(null);
      notify.onChange();
    } catch (e) {
      notify.flash(e instanceof Error ? e.message : "Ça n'a pas marché, réessaie.", true);
    } finally {
      setBusy(false);
    }
  }

  const n = open?.word.trim() ? countIn(v, open.word.trim()) : 0;

  return (
    <>
      <div className="words say">
        {[...new Set(words)].map((w) => {
          const rule = ruleOf(w);
          return (
            <button
              key={w}
              className={rule ? "rule" : undefined}
              data-say={rule?.say}
              aria-expanded={open !== null && norm(open.word) === norm(w)}
              title={rule ? `La voix dit « ${rule.say} »` : "Dire ce mot autrement"}
              onClick={() => setOpen(open && norm(open.word) === norm(w) ? null : { word: rule?.word ?? w, say: rule?.say ?? "", known: Boolean(rule) })}
            >
              {w}
            </button>
          );
        })}
      </div>
      {phrases.map((p) => (
        <button key={p.word} className="phrase" onClick={() => setOpen({ word: p.word, say: p.say, known: true })} title="Modifier">
          <b>{p.word}</b> → {p.say}
        </button>
      ))}
      {open && (
        <form
          className="say-pop"
          onSubmit={(e) => {
            e.preventDefault();
            if (open.word.trim() && open.say.trim()) void send("POST", { word: open.word.trim(), say: open.say.trim() });
          }}
        >
          <div className="r">
            <input className="field" value={open.word} onChange={(e) => setOpen({ ...open, word: e.target.value })} aria-label="Le mot, écrit" maxLength={60} />
            <span className="mute">se dit</span>
            <input
              className="field"
              autoFocus
              value={open.say}
              onChange={(e) => setOpen({ ...open, say: e.target.value })}
              placeholder="Chadé"
              aria-label="Comment la voix le dit"
              maxLength={120}
            />
          </div>
          <div className="r">
            <button className="btn dark sm" type="submit" disabled={busy || !open.word.trim() || !open.say.trim()}>
              Partout comme ça
            </button>
            {open.known && (
              <button className="btn ghost sm" type="button" disabled={busy} onClick={() => send("DELETE", { word: open.word.trim() })}>
                <X size={14} /> Lire tel quel
              </button>
            )}
            <span className="mute" style={{ fontSize: 12.5 }}>
              {n} {n > 1 ? "lignes" : "ligne"} dans cette vidéo · vaut pour toutes les vidéos
            </span>
          </div>
        </form>
      )}
    </>
  );
}
