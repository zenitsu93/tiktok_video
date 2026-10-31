"use client";

import { Check, RotateCcw, Send } from "lucide-react";
import { useState } from "react";
import type { VideoView } from "@/lib/view";
import { Caption } from "./caption";
import { Disc } from "./waits";

/** A send is "moving" while TikTok has not answered, for twenty minutes at most (the worker follows it fifteen). */
export function tiktokMoving(v: VideoView): boolean {
  const s = v.tiktok.send;
  return Boolean(s && (s.status === "sending" || s.status === "processing") && Date.now() - Date.parse(s.at) < 20 * 60_000);
}

type Step = "idle" | "on" | "done";

/** Where the last send of this MP4 is: on its way, in the TikTok inbox, never confirmed, or failed. */
function sendState(v: VideoView, pending: boolean) {
  const current = v.tiktok.send?.current ? v.tiktok.send : null;
  const moving = pending || (Boolean(current) && tiktokMoving(v));
  const sent = current?.status === "inbox";
  const unconfirmed = current?.status === "processing" && !tiktokMoving(v);
  const stage = pending || current?.status === "sending" ? "sending" : moving ? "processing" : sent ? "done" : "idle";
  return { current, moving, sent, unconfirmed, stage };
}

/**
 * « Envoyer sur TikTok »: the MP4 goes to the TikTok inbox, without music. The button fills
 * while it travels; the steps say where it is (Envoi, Boîte TikTok).
 */
export function SendToTikTok({ v, onQueued, flash, big }: { v: VideoView; onQueued: () => void; flash: (text: string, err?: boolean) => void; big?: boolean }) {
  const [pending, setPending] = useState(false);
  const { configured, connected } = v.tiktok;
  if (!configured) return null;
  if (!connected) {
    return (
      <a className={`btn dark${big ? " lg" : ""}`} href={`/auth/tiktok?next=/v/${v.id}`} title="Une seule fois : autorise la Régie à envoyer dans ta boîte TikTok">
        Connecter TikTok
      </a>
    );
  }
  const { moving, sent, unconfirmed, stage } = sendState(v, pending);
  const steps: [string, Step][] = [
    ["Envoi", moving ? "on" : sent || unconfirmed ? "done" : "idle"],
    ["Boîte TikTok", sent ? "done" : "idle"],
  ];
  async function go() {
    setPending(true);
    try {
      const r = await fetch(`/api/videos/${v.id}/tiktok`, { method: "POST" });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error ?? `Erreur ${r.status}`);
      onQueued();
    } catch (e) {
      flash(e instanceof Error ? e.message : "Envoi impossible", true);
    } finally {
      setPending(false);
    }
  }
  return (
    <>
      {(moving || sent || unconfirmed) && (
        <span className="publish-steps" aria-live="polite">
          {steps.map(([label, st]) => (
            <i key={label} className={st}>
              {st === "done" && <Check size={12} />} {label}
            </i>
          ))}
        </span>
      )}
      <button
        className={`btn primary${big ? " lg" : ""} tiktok-send ${stage}`}
        disabled={!v.download || moving || sent}
        onClick={go}
        title={
          stage === "processing"
            ? "Le fichier est chez TikTok. TikTok le prépare de son côté : de 30 s à plus de 10 min selon les fois. Tu peux fermer la page."
            : "Envoie le MP4 dans ta boîte TikTok, sans musique"
        }
      >
        <span className="fill" aria-hidden />
        {stage === "sending" || stage === "processing" ? (
          <>
            <Disc size={16} /> {stage === "sending" ? "Envoi…" : "Reçue · TikTok la prépare…"}
          </>
        ) : sent ? (
          <>
            <Check size={15} /> Dans ta boîte TikTok
          </>
        ) : (
          <>
            <Send size={15} /> Envoyer sur TikTok
          </>
        )}
      </button>
    </>
  );
}

/**
 * The TikTok tab: everything needed once the MP4 leaves, beside the send (which sits in the
 * action bar): where the send is, the caption to paste, and what is left to do in the TikTok app.
 */
export function TikTokTab({
  v,
  writeCaption,
  again,
  children,
}: {
  v: VideoView;
  writeCaption: () => void;
  /** Makes the file again with the latest settings and sends it again (↺ after a send). */
  again: () => void;
  children?: React.ReactNode;
}) {
  const { current, sent, unconfirmed, moving } = sendState(v, false);
  const canRedo = v.status === "ready" && v.beats.length > 0;
  return (
    <>
      {!v.download && (
        <p className="mute" style={{ margin: 0 }}>
          Le MP4 n&apos;est pas encore fabriqué : « Fabriquer le MP4 » dans l&apos;onglet Montage.
        </p>
      )}
      {v.tiktok.configured && (sent || unconfirmed || moving || current?.status === "error") && (
        <section className="panel">
          <span className="eyebrow">Envoi sur TikTok</span>
          {moving && <span>Le fichier voyage vers TikTok. TikTok le prépare ensuite de son côté, de 30 s à plus de 10 min. Tu peux fermer la page.</span>}
          {sent && <span>Il est dans ta boîte de réception TikTok, en brouillon, sans musique.</span>}
          {unconfirmed && <span>TikTok n&apos;a pas confirmé : regarde dans ta boîte de réception avant de renvoyer, pour ne pas l&apos;avoir en double.</span>}
          {current?.status === "error" && current.error && (
            <span className="chip hot" style={{ whiteSpace: "normal", alignSelf: "flex-start" }}>
              <span className="dot" />
              {current.error}
            </span>
          )}
          {(sent || unconfirmed) && (
            <button
              className="btn sm"
              style={{ alignSelf: "flex-start" }}
              disabled={!canRedo}
              onClick={again}
              title="Refaire le fichier avec les derniers réglages et le renvoyer sur TikTok"
            >
              <RotateCcw size={14} /> Refaire et renvoyer
            </button>
          )}
        </section>
      )}
      {!v.tiktok.configured && (
        <p className="mute" style={{ margin: 0, fontSize: 14 }}>
          L&apos;envoi direct sur TikTok n&apos;est pas configuré : télécharge le MP4.
        </p>
      )}
      <Caption v={v} write={writeCaption} />
      <section className="panel">
        <span className="eyebrow">{sent ? "À finir dans l'app TikTok" : "Après l'envoi, dans l'app TikTok"}</span>
        <ol className="todo">
          <li>Ouvre la notification « Boîte de réception »</li>
          <li>Ajoute le son de la chanson, volume 10 à 20 %</li>
          <li>Colle la légende (bouton « Copier » au-dessus)</li>
          <li>Publie</li>
        </ol>
      </section>
      {children}
    </>
  );
}
