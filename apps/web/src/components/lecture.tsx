"use client";

import { Wand2 } from "lucide-react";
import { useState } from "react";
import { reading, rewriting } from "@/lib/steps";
import type { VideoView } from "@/lib/view";
import { Disc } from "./waits";

/** Spoken French in Thomas's videos runs at about 2.6 words a second. */
const WPS = 2.6;
export const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
export const tooShort = (s: string) => s.trim().length < 80;

export type ScriptSend = (payload: { action: "save" | "approve" | "rewrite"; draft: string; instruction?: string }, ok: string) => Promise<void>;

function Sources({ v, open }: { v: VideoView; open?: boolean }) {
  if (!v.sources.length) return null;
  return (
    <details className="panel" open={open}>
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
  );
}

/**
 * The Histoire tab: the script as one text, at every moment. While it waits for approval
 * Thomas corrects it by hand or asks Claude for a rewrite (« Valider le script » is in the
 * action bar); while Claude rewrites it, it stays readable. Once cut into shots it stays here
 * as one text, each sentence marked as soon as its voice is ready.
 */
export function Histoire({ v, text, setText, send, pending }: { v: VideoView; text: string; setText: (s: string) => void; send: ScriptSend; pending: boolean }) {
  const [ask, setAsk] = useState("");

  if (reading(v)) {
    const busy = rewriting(v);
    const locked = busy || pending;
    const n = wordCount(text);
    return (
      <>
        <div className="r" style={{ alignItems: "center" }}>
          <span className="eyebrow">Ton script · modifiable</span>
          <span className="chip mono" title="Durée estimée de la voix off">
            {n} mots · ~{Math.round(n / WPS)} s
          </span>
        </div>
        {busy && (
          <div className="banner" role="status">
            <Disc size={22} /> Claude réécrit le script. Le texte d&apos;avant reste lisible ici.
          </div>
        )}
        {v.error && (
          <p className="chip hot" role="alert" style={{ whiteSpace: "normal", alignSelf: "flex-start", margin: 0 }}>
            {v.error}
          </p>
        )}
        <textarea
          className="script-edit"
          aria-label="Script de la voix off"
          value={text}
          readOnly={locked}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => {
            if (!locked && !tooShort(text) && text.trim() !== (v.draft ?? "").trim()) void send({ action: "save", draft: text.trim() }, "Script enregistré");
          }}
        />
        <form
          className="ask-bar"
          onSubmit={(e) => {
            e.preventDefault();
            if (!ask.trim() || locked) return;
            void send({ action: "rewrite", draft: text.trim(), instruction: ask.trim() }, "Réécriture demandée").then(() => setAsk(""));
          }}
        >
          <Wand2 size={15} className="mute" />
          <input
            value={ask}
            onChange={(e) => setAsk(e.target.value)}
            placeholder="Demander à Claude : « accroche plus choc », « raccourcis la fin »…"
            maxLength={1000}
            disabled={locked || !v.providers.claude}
            aria-label="Consigne de réécriture"
            title={v.providers.claude ? undefined : "Ajoute ta clé Claude pour demander une réécriture"}
          />
          <button className="btn dark sm" type="submit" disabled={locked || !ask.trim() || !v.providers.claude}>
            Réécrire
          </button>
        </form>
        <Sources v={v} />
      </>
    );
  }

  // after approval: the same text, cut into shots; each sentence turns green once its voice is there
  if (v.beats.length) {
    const voicing = v.status === "generating" && /voix/i.test(v.progress?.step ?? "");
    return (
      <>
        {voicing && (
          <div className="banner" role="status">
            <span className="wave">
              <i />
              <i />
              <i />
              <i />
              <i />
            </span>
            La voix se fait ({v.progress?.done ?? 0}/{v.progress?.total ?? v.beats.length}). Le texte reste là ; chaque phrase se souligne quand sa voix est prête.
          </div>
        )}
        <p className="script-read">
          {v.beats.map((b, i) => (
            <span key={b.id}>
              {i > 0 && " "}
              <span className={voicing ? (b.voiceStale || v.busy.includes(b.id) ? "pend" : "said") : undefined}>{b.text}</span>
            </span>
          ))}
        </p>
        <p className="mute" style={{ margin: 0, fontSize: 14 }}>
          Pour changer une phrase, clique-la dans l&apos;onglet Voix ou Montage : sa voix se refait toute seule.
        </p>
        <Sources v={v} />
      </>
    );
  }

  // approved, being cut into shots: the approved text, read-only
  if (v.draft) {
    return (
      <>
        <div className="banner" role="status">
          <Disc size={22} /> Découpage en plans. Ton texte validé reste lisible ici.
        </div>
        <p className="script-read">{v.draft}</p>
        <Sources v={v} />
      </>
    );
  }

  return (
    <>
      <div className="banner" role="status">
        <Disc size={22} /> Claude cherche ses sources et écrit l&apos;histoire. Le texte s&apos;affiche ici dès qu&apos;il est prêt.
      </div>
      {v.angle && (
        <p className="mute" style={{ margin: 0 }}>
          Angle : {v.angle}
        </p>
      )}
      <Sources v={v} open />
    </>
  );
}
