"use client";

import { Loader2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Deletes the video for good, with its images, voice and exports. The first click only
 * arms the button; a second one within a few seconds deletes and goes back to the list.
 */
export function DeleteVideo({ id, short = false }: { id: string; short?: boolean }) {
  const router = useRouter();
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);

  async function remove() {
    setBusy(true);
    setFailed(null);
    const r = await fetch(`/api/videos/${id}`, { method: "DELETE" }).catch(() => null);
    if (r?.ok) {
      router.push("/");
      router.refresh();
      return;
    }
    const data = await r?.json().catch(() => ({}));
    setFailed(data?.error ?? "La suppression n'a pas abouti, réessaie.");
    setBusy(false);
    setArmed(false);
  }

  if (busy) {
    return (
      <button className="btn primary sm" disabled>
        <Loader2 size={15} className="spin" /> Suppression…
      </button>
    );
  }
  return armed ? (
    <button className="btn primary sm" onClick={remove} autoFocus>
      <Trash2 size={15} /> {short ? "Confirmer" : "Confirmer la suppression"}
    </button>
  ) : (
    <button className="btn ghost sm" onClick={() => setArmed(true)} title={failed ?? "Supprimer la vidéo, ses images, sa voix et ses exports"} aria-label="Supprimer la vidéo">
      <Trash2 size={15} />
      {failed && <span className="chip hot">{failed}</span>}
    </button>
  );
}
