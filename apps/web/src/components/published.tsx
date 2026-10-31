"use client";

import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

async function tick(id: string, published: boolean) {
  const r = await fetch(`/api/videos/${id}/published`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ published }),
  }).catch(() => null);
  return Boolean(r?.ok);
}

/**
 * « Le tampon »: the round box at the end of a video waiting to be published. A tap ticks it
 * and the line moves to « Publiées »; a tap there unticks it. TikTok never tells the Régie.
 */
export function PublishedBox({ id, on }: { id: string; on: boolean }) {
  const router = useRouter();
  const [checked, setChecked] = useState(on);
  const [busy, setBusy] = useState(false);
  useEffect(() => setChecked(on), [on]);
  async function toggle() {
    setBusy(true);
    setChecked(!checked);
    if (await tick(id, !checked)) router.refresh();
    else setChecked(checked);
    setBusy(false);
  }
  return (
    <button
      className={`pubbox${checked ? " on" : ""}`}
      onClick={toggle}
      disabled={busy}
      aria-pressed={checked}
      aria-label={checked ? "Décocher : pas encore publiée" : "Cocher : publiée sur TikTok"}
      title={checked ? "Décocher : pas encore publiée" : "Publiée sur TikTok"}
    >
      <Check size={16} strokeWidth={3} />
    </button>
  );
}

const SNOOZE = "regie:pas-encore:";

/**
 * A video downloaded or sent a while ago and never ticked: the home screen asks once.
 * « Pas encore » keeps quiet about it for a day (in this browser).
 */
export function AskPublished({ id, title, how }: { id: string; title: string; how: string }) {
  const router = useRouter();
  const [hidden, setHidden] = useState(true);
  useEffect(() => {
    try {
      setHidden(Number(localStorage.getItem(SNOOZE + id) ?? 0) > Date.now());
    } catch {
      setHidden(false);
    }
  }, [id]);
  if (hidden) return null;
  return (
    <div className="pubask" role="status">
      <b>
        {title}, {how} : publiée ?
      </b>
      <span style={{ display: "flex", gap: 6 }}>
        <button
          className="btn dark sm"
          onClick={async () => {
            setHidden(true);
            if (await tick(id, true)) router.refresh();
            else setHidden(false);
          }}
        >
          Oui, publiée
        </button>
        <button
          className="btn sm"
          onClick={() => {
            setHidden(true);
            try {
              localStorage.setItem(SNOOZE + id, String(Date.now() + 24 * 3600_000));
            } catch {}
          }}
        >
          Pas encore
        </button>
      </span>
    </div>
  );
}
