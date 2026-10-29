"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function LaunchForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [angle, setAngle] = useState(false);

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
    <form onSubmit={submit}>
      <input className="field" name="title" required maxLength={120} placeholder="We Are the World" aria-label="Titre de la chanson" autoComplete="off" />
      <input className="field" name="artist" required maxLength={120} placeholder="USA for Africa" aria-label="Artiste" autoComplete="off" />
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
        {busy ? "Lancement…" : "Lancer"}
      </button>
    </form>
  );
}
