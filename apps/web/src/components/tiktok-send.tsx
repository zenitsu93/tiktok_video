"use client";

import { Check } from "lucide-react";
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
        title={v.download ? "Envoie le dernier export dans ta boîte TikTok, sans musique" : "Exporte d'abord le MP4"}
      >
        <span className="fill" aria-hidden />
        {stage === "sending" || stage === "processing" ? (
          <>
            <Disc size={16} /> {stage === "sending" ? "Envoi…" : "TikTok prépare…"}
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
