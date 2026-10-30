"use client";

import { Check, Download, RotateCcw } from "lucide-react";
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
 * The one action of Le Fil, « Envoyer sur TikTok »: the preview already is the finished video,
 * so the click makes its file (only the changed shots go through the renderer) and the file
 * then goes to the TikTok inbox by itself. Three steps say where it is: Fichier, Envoi, Boîte TikTok.
 * Without TikTok connected, the same button makes the MP4 and becomes « Télécharger le MP4 ».
 */
export function Publish({
  v,
  canRender,
  upToDate,
  render,
  onQueued,
  flash,
}: {
  v: VideoView;
  canRender: boolean;
  upToDate: boolean;
  render: (again?: boolean) => void;
  onQueued: () => void;
  flash: (text: string, err?: boolean) => void;
}) {
  const [pending, setPending] = useState(false);
  const { configured, connected, send } = v.tiktok;
  const rendering = v.status === "rendering";
  const p = v.progress;
  const fileLabel = p && p.total > 1 ? `Fichier ${p.done}/${p.total}` : "Fichier…";

  if (!configured || !connected) {
    return (
      <>
        {upToDate && v.download ? (
          <a className="btn primary sm" href={v.download} download>
            <Download size={15} /> Télécharger le MP4
          </a>
        ) : (
          <button className="btn primary sm" disabled={!canRender} onClick={() => render()} title="L'aperçu est la vidéo finale : ce bouton en fabrique le fichier">
            {rendering ? <Disc size={16} /> : <Download size={15} />} {rendering ? fileLabel : "Préparer le MP4"}
          </button>
        )}
        {configured && (
          <a className="btn dark sm" href={`/auth/tiktok?next=/v/${v.id}`} title="Une seule fois : autorise la Régie à envoyer dans ta boîte TikTok">
            Connecter TikTok
          </a>
        )}
      </>
    );
  }

  const current = send?.current && upToDate ? send : null;
  const moving = pending || (Boolean(current) && tiktokMoving(v));
  const sent = current?.status === "inbox";
  const unconfirmed = current?.status === "processing" && !tiktokMoving(v);
  const steps: [string, Step][] = [
    ["Fichier", rendering ? "on" : upToDate ? "done" : "idle"],
    ["Envoi", moving ? "on" : sent || unconfirmed ? "done" : "idle"],
    ["Boîte TikTok", sent ? "done" : "idle"],
  ];
  const stage = rendering || pending || current?.status === "sending" ? "sending" : moving ? "processing" : sent ? "done" : "idle";

  async function go() {
    // the file is not the preview yet: make it, it leaves for TikTok by itself once made
    if (!upToDate || !v.download) return render();
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
      {(rendering || moving || sent || unconfirmed) && (
        <span className="publish-steps" aria-live="polite">
          {steps.map(([label, st]) => (
            <i key={label} className={st}>
              {st === "done" && <Check size={12} />} {label === "Fichier" && rendering ? fileLabel : label}
            </i>
          ))}
        </span>
      )}
      <button
        className={`btn primary sm tiktok-send ${stage}`}
        disabled={!canRender || rendering || moving || sent}
        onClick={go}
        title={
          stage === "processing"
            ? "Le fichier est chez TikTok. TikTok le prépare de son côté : de 30 s à plus de 10 min selon les fois. Tu peux fermer la page."
            : "L'aperçu est la vidéo finale : le clic en fabrique le fichier (seuls les plans modifiés) et l'envoie dans ta boîte TikTok, sans musique"
        }
      >
        <span className="fill" aria-hidden />
        {rendering ? (
          <>
            <Disc size={16} /> Préparation du fichier…
          </>
        ) : stage === "sending" || stage === "processing" ? (
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
      {v.download && (
        <a className="btn ghost sm" href={v.download} download title={upToDate ? "Télécharger le MP4" : "Télécharger le dernier fichier"} aria-label="Télécharger le MP4">
          <Download size={15} />
        </a>
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
