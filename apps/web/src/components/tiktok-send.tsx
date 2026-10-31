"use client";

import { Check, Download, Film, RotateCcw } from "lucide-react";
import { useState } from "react";
import type { VideoView } from "@/lib/view";
import { Disc } from "./waits";

/** A send is "moving" while TikTok has not answered, for twenty minutes at most (the worker follows it fifteen). */
export function tiktokMoving(v: VideoView): boolean {
  const s = v.tiktok.send;
  return Boolean(s && (s.status === "sending" || s.status === "processing") && Date.now() - Date.parse(s.at) < 20 * 60_000);
}

/**
 * "Envoyer sur TikTok", beside the MP4 download: the last export goes to the
 * TikTok inbox without music. The button fills while it travels, then a chip says
 * where to finish (add the sound in TikTok, publish).
 */
export function TikTokSend({ v, onQueued, flash }: { v: VideoView; onQueued: () => void; flash: (text: string, err?: boolean) => void }) {
  const [pending, setPending] = useState(false);
  const { configured, connected, send } = v.tiktok;
  if (!configured) return null;
  if (!connected) {
    return (
      <a className="btn dark sm" href={`/auth/tiktok?next=/v/${v.id}`} title="Une seule fois : autorise la Régie à envoyer dans ta boîte TikTok">
        Connecter TikTok
      </a>
    );
  }

  const current = send?.current ? send : null;
  const moving = pending || tiktokMoving(v);
  const sent = current?.status === "inbox";
  const stage = pending || current?.status === "sending" ? "sending" : current?.status === "processing" && moving ? "processing" : sent ? "done" : "idle";
  // TikTok never confirmed, but such a video usually lands anyway
  const unconfirmed = current?.status === "processing" && !moving;

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
      <button
        className={`btn dark sm tiktok-send ${stage}`}
        disabled={!v.download || moving || sent}
        onClick={go}
        title={
          stage === "processing"
            ? "Le fichier est chez TikTok. TikTok le prépare de son côté : de 30 s à plus de 10 min selon les fois. Tu peux fermer la page."
            : v.download
              ? "Envoie le dernier export dans ta boîte TikTok, sans musique"
              : "Exporte d'abord le MP4"
        }
      >
        <span className="fill" aria-hidden />
        {stage === "sending" || stage === "processing" ? (
          <>
            <Disc size={16} /> {stage === "sending" ? "Envoi…" : "Reçue · TikTok la prépare…"}
          </>
        ) : sent ? (
          <>
            <Check size={15} /> Envoyée
          </>
        ) : (
          "Envoyer sur TikTok"
        )}
      </button>
      {sent && (
        <span className="chip ok" title="App TikTok, Boîte de réception : ouvre la notification, ajoute le son, colle la légende, puis publie">
          <span className="dot" />
          Dans ta boîte de réception TikTok
        </span>
      )}
      {unconfirmed && (
        <span className="chip" title="Regarde dans l'app TikTok avant de renvoyer, pour ne pas l'avoir en double">
          <span className="dot" />
          TikTok n&apos;a pas confirmé : regarde dans ta boîte de réception
        </span>
      )}
      {current?.status === "error" && current.error && (
        <span className="chip hot" style={{ whiteSpace: "normal" }}>
          <span className="dot" />
          {current.error}
        </span>
      )}
    </>
  );
}

type Step = "idle" | "on" | "done";

/**
 * The end of Le Fil, in two times. The preview already is the finished video: « Fabriquer le MP4 »
 * only makes its file (only the changed shots go through the renderer). Once the file is the preview,
 * two choices: « Télécharger » or « Envoyer sur TikTok », whose steps say where it is (Envoi, Boîte TikTok).
 */
export function Publish({
  v,
  canRender,
  upToDate,
  render,
  prepare,
  onQueued,
  flash,
}: {
  v: VideoView;
  canRender: boolean;
  upToDate: boolean;
  /** Makes the file again and sends it to TikTok (↺ after a send). */
  render: (again?: boolean) => void;
  /** Makes the MP4 without sending it anywhere. */
  prepare: () => void;
  onQueued: () => void;
  flash: (text: string, err?: boolean) => void;
}) {
  const [pending, setPending] = useState(false);
  const { configured, connected, send } = v.tiktok;
  const tiktok = configured && connected;
  const rendering = v.status === "rendering";
  const p = v.progress;
  const connect = configured && !connected && (
    <a className="btn dark sm" href={`/auth/tiktok?next=/v/${v.id}`} title="Une seule fois : autorise la Régie à envoyer dans ta boîte TikTok">
      Connecter TikTok
    </a>
  );

  if (rendering || !upToDate || !v.download) {
    return (
      <>
        <button className="btn primary sm" disabled={!canRender || rendering} onClick={prepare} title="L'aperçu est déjà la vidéo montée : ce bouton en fabrique le fichier MP4 (seuls les plans modifiés)">
          {rendering ? <Disc size={16} /> : <Film size={15} />}{" "}
          {rendering ? (p && p.total > 1 ? `Fabrication ${p.done}/${p.total}` : "Fabrication du MP4…") : v.download ? "Refabriquer le MP4" : "Fabriquer le MP4"}
        </button>
        {connect}
      </>
    );
  }

  const download = (
    <a className={`btn ${tiktok ? "" : "primary "}sm`} href={v.download} download title="Le fichier de la vidéo, telle que dans l'aperçu">
      <Download size={15} /> Télécharger
    </a>
  );
  if (!tiktok) {
    return (
      <>
        {download}
        {connect}
      </>
    );
  }

  const current = send?.current ? send : null;
  const moving = pending || (Boolean(current) && tiktokMoving(v));
  const sent = current?.status === "inbox";
  const unconfirmed = current?.status === "processing" && !tiktokMoving(v);
  const steps: [string, Step][] = [
    ["Envoi", moving ? "on" : sent || unconfirmed ? "done" : "idle"],
    ["Boîte TikTok", sent ? "done" : "idle"],
  ];
  const stage = pending || current?.status === "sending" ? "sending" : moving ? "processing" : sent ? "done" : "idle";

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
      {download}
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
        className={`btn primary sm tiktok-send ${stage}`}
        disabled={!canRender || moving || sent}
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
          "Envoyer sur TikTok"
        )}
      </button>
      {sent && (
        // made and sent: redo it with the latest settings (voice level…) and send it again
        <button className="btn ghost sm" disabled={!canRender} onClick={() => render(true)} title="Refaire le fichier avec les derniers réglages et le renvoyer sur TikTok" aria-label="Refaire et renvoyer sur TikTok">
          <RotateCcw size={15} />
        </button>
      )}
      {sent && (
        <span className="chip ok" title="App TikTok, Boîte de réception : ouvre la notification, ajoute le son, colle la légende, puis publie">
          <span className="dot" />
          Ouvre TikTok : ajoute le son, colle la légende, publie
        </span>
      )}
      {unconfirmed && (
        <span className="chip" title="Regarde dans l'app TikTok avant de renvoyer, pour ne pas l'avoir en double">
          <span className="dot" />
          TikTok n&apos;a pas confirmé : regarde dans ta boîte de réception
        </span>
      )}
      {current?.status === "error" && current.error && (
        <span className="chip hot" style={{ whiteSpace: "normal" }}>
          <span className="dot" />
          {current.error}
        </span>
      )}
    </>
  );
}
