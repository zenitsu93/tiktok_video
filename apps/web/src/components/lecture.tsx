"use client";

import { ArrowLeft, Check, Wand2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { VideoView } from "@/lib/view";
import { DeleteVideo } from "./delete-video";
import { StatusChip } from "./status";
import { Disc } from "./waits";

/** Spoken French in Thomas's videos runs at about 2.6 words a second. */
const WPS = 2.6;
const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

/**
 * The reading step: the script as one text, before anything paid is spent.
 * Thomas corrects it by hand or asks Claude for a rewrite, then approves it,
 * which starts the shots, the voice and the images.
 */
export function Lecture({
  v,
  rewriting,
  send,
}: {
  v: VideoView;
  rewriting: boolean;
  send: (payload: { action: "save" | "approve" | "rewrite"; draft: string; instruction?: string }, ok: string) => Promise<void>;
}) {
  const [text, setText] = useState(v.draft ?? "");
  const [ask, setAsk] = useState("");
  const [pending, setPending] = useState(false);
  const saved = useRef(v.draft ?? "");

  // a rewrite came back: show Claude's new version
  useEffect(() => {
    if (v.draft !== null && v.draft !== saved.current) {
      saved.current = v.draft;
      setText(v.draft);
    }
  }, [v.draft]);

  const n = words(text);
  const secs = Math.round(n / WPS);
  const tooShort = text.trim().length < 80;
  const locked = rewriting || pending;

  async function go(action: "save" | "approve" | "rewrite", ok: string) {
    setPending(true);
    try {
      await send({ action, draft: text.trim(), ...(action === "rewrite" ? { instruction: ask.trim() } : {}) }, ok);
      saved.current = text.trim();
      if (action === "rewrite") setAsk("");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="lecture">
      <header className="fil-head">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Link href="/" className="btn ghost sm" aria-label="Retour aux vidéos">
            <ArrowLeft size={16} />
          </Link>
          <h1 className="t">
            {v.title} <span>· {v.artist}</span>
          </h1>
        </div>
        <div className="meta">
          <StatusChip status={v.status} />
          {v.angle && <span className="chip">angle : {v.angle}</span>}
          <span className="chip mono" title="Durée estimée de la voix off">
            {n} mots · ~{secs} s
          </span>
          <span style={{ marginLeft: "auto" }} />
          <DeleteVideo id={v.id} />
        </div>
      </header>

      <p className="mute" style={{ margin: 0, fontSize: 15 }}>
        Relis l&apos;histoire avant qu&apos;on lance le reste. Tu peux corriger le texte directement ou demander une réécriture à Claude. Rien n&apos;est dépensé en voix ni en images tant que tu n&apos;as pas validé.
      </p>

      {v.error && (
        <p className="chip hot" role="alert" style={{ whiteSpace: "normal", alignSelf: "flex-start", margin: 0 }}>
          {v.error}
        </p>
      )}

      <div className="lecture-page">
        <textarea
          aria-label="Script de la voix off"
          value={text}
          readOnly={locked}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => {
            if (!locked && !tooShort && text.trim() !== saved.current) void go("save", "Script enregistré");
          }}
        />
        {rewriting && (
          <div className="lecture-busy" role="status">
            <Disc size={56} />
            <span>Claude réécrit le script…</span>
          </div>
        )}
      </div>

      <form
        className="lecture-ask"
        onSubmit={(e) => {
          e.preventDefault();
          if (ask.trim() && !locked) void go("rewrite", "Réécriture demandée");
        }}
      >
        <input
          className="field"
          value={ask}
          onChange={(e) => setAsk(e.target.value)}
          placeholder="Demander à Claude : « accroche plus choc », « raccourcis la fin »…"
          maxLength={1000}
          disabled={locked || !v.providers.claude}
          title={v.providers.claude ? undefined : "Ajoute ta clé Claude pour demander une réécriture"}
        />
        <button className="btn" type="submit" disabled={locked || !ask.trim() || !v.providers.claude}>
          <Wand2 size={15} /> Réécrire
        </button>
      </form>

      {v.sources.length > 0 && (
        <details className="panel">
          <summary>Sources du script ({v.sources.length})</summary>
          <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: 13 }}>
            {v.sources.map((s) => (
              <li key={s} style={{ overflowWrap: "anywhere" }}>
                {/^https?:\/\//.test(s) ? (
                  <a href={s} target="_blank" rel="noopener noreferrer nofollow">
                    {s}
                  </a>
                ) : (
                  s
                )}
              </li>
            ))}
          </ul>
        </details>
      )}

      <div className="lecture-go">
        <button className="btn primary" disabled={locked || tooShort} onClick={() => void go("approve", "Script validé, on lance la suite")}>
          <Check size={16} /> Valider le script
        </button>
        <span className="mute" style={{ fontSize: 13 }}>
          Lance le découpage en plans, la voix et les images.
        </span>
      </div>
    </main>
  );
}
