"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Disc } from "./waits";

/** Songs the empty fields type out as examples, one after the other. */
const EXAMPLES = [
  ["We Are the World", "USA for Africa"],
  ["Billie Jean", "Michael Jackson"],
  ["Like a Tattoo", "Sade"],
  ["Bohemian Rhapsody", "Queen"],
  ["Sweet Dreams", "Eurythmics"],
] as const;

/**
 * Types the examples into the placeholders, then erases them. Stops for good
 * once Thomas starts typing, and never runs when the system asks for less motion.
 */
function useTypedExamples() {
  const [ph, setPh] = useState<[string, string]>(["We Are the World", "USA for Africa"]);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let alive = true;
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const touched = () => {
      const f = form.current;
      return !f || [...f.querySelectorAll<HTMLInputElement>("input")].some((el) => el.value || el === document.activeElement);
    };
    (async () => {
      await wait(1400);
      for (let k = 0; alive; k = (k + 1) % EXAMPLES.length) {
        const [t, a] = EXAMPLES[k] ?? EXAMPLES[0];
        for (let i = 0; i <= t.length && alive; i++) {
          if (!touched()) setPh([t.slice(0, i), ""]);
          await wait(60);
        }
        for (let i = 0; i <= a.length && alive; i++) {
          if (!touched()) setPh([t, a.slice(0, i)]);
          await wait(55);
        }
        await wait(2200);
        for (let i = t.length; i >= 0 && alive; i--) {
          if (!touched()) setPh([t.slice(0, i), a.slice(0, Math.round((i / t.length) * a.length))]);
          await wait(24);
        }
        await wait(300);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);
  return { ph, form };
}

export function LaunchForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [angle, setAngle] = useState(false);
  const { ph, form } = useTypedExamples();

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    const r = await fetch("/api/videos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: f.get("title"), artist: f.get("artist"), angle: f.get("angle") ?? "" }),
    }).catch(() => null);
    const data = r ? await r.json().catch(() => ({})) : {};
    if (r?.ok && data.id) return router.push(`/v/${data.id}`);
    setBusy(false);
    setError(data.error ?? "Impossible de lancer la vidéo.");
  }

  return (
    <form onSubmit={submit} ref={form}>
      <input className="field" name="title" required maxLength={120} placeholder={ph[0]} aria-label="Titre de la chanson" autoComplete="off" />
      <input className="field" name="artist" required maxLength={120} placeholder={ph[1]} aria-label="Artiste" autoComplete="off" />
      {angle ? (
        <textarea className="field" name="angle" maxLength={300} rows={2} placeholder="L'angle : la nuit où 46 stars ont laissé leur ego à la porte" aria-label="Angle de l'histoire" />
      ) : (
        <button type="button" className="btn ghost sm" style={{ alignSelf: "flex-start" }} onClick={() => setAngle(true)}>
          + Un angle en tête ?
        </button>
      )}
      {error && (
        <p className="chip hot" role="alert" style={{ alignSelf: "flex-start", whiteSpace: "normal" }}>
          {error}
        </p>
      )}
      <button className="btn primary go" disabled={busy}>
        {busy ? (
          <>
            <Disc size={24} /> Lancement…
          </>
        ) : (
          "Lancer"
        )}
      </button>
    </form>
  );
}
