"use client";

import { Download, X } from "lucide-react";

/**
 * Everything shown while the worker is busy, built on the record from the
 * "Le Sillon" logo, so waiting looks like the channel and says where things are.
 */

export const PIPELINE = ["Recherche et écriture", "Découpage", "Voix", "Images", "Fichier vidéo"] as const;

/** Maps the worker's progress step to a pipeline stage. */
export function stageOf(step: string | undefined, rendering: boolean): number {
  if (rendering) return 4;
  if (!step) return 0;
  if (/découpage/i.test(step)) return 1;
  if (/voix/i.test(step)) return 2;
  if (/image/i.test(step)) return 3;
  if (/fichier|montage/i.test(step)) return 4;
  return 0;
}

export function Disc({ size, spin = true, label = true }: { size: number; spin?: boolean; label?: boolean }) {
  return (
    <span className={`disc${spin ? " spinning" : ""}`} style={{ width: size, height: size }} aria-hidden>
      {label && <span className="lab" />}
    </span>
  );
}

/** The first generation: a turntable whose arm moves in as the stages pass. */
export function Platine({ stage, detail, compact }: { stage: number; detail?: string; compact?: boolean }) {
  return (
    <div className={`platine${compact ? " compact" : ""}`} role="status" aria-live="polite">
      <div className="deck">
        <Disc size={compact ? 84 : 150} />
        <span className="arm" style={{ transform: `rotate(${12 + stage * 6}deg)` }} />
      </div>
      <ol className="steps">
        {PIPELINE.map((s, i) => (
          <li key={s} className={i < stage ? "done" : i === stage ? "now" : ""}>
            <i />
            {s}
            {i === stage && detail && <span className="mono mute"> {detail}</span>}
          </li>
        ))}
      </ol>
    </div>
  );
}

/** One line at work: a small spinning record, or a waveform while its voice is being made. */
export function LineBusy({ voice }: { voice: boolean }) {
  return voice ? (
    <span className="wave" role="status" aria-label="Voix en cours">
      <i />
      <i />
      <i />
      <i />
      <i />
    </span>
  ) : (
    <span role="status" aria-label="En cours">
      <Disc size={22} label={false} />
    </span>
  );
}

/** New images on their way: cards dealt in a fan, with the search being run. */
export function Fan({ query }: { query?: string }) {
  return (
    <div className="fanwrap" role="status">
      <div className="fan" aria-hidden>
        <i />
        <i />
        <i />
        <i />
      </div>
      <span className="mute" style={{ fontSize: 14 }}>
        {query ? (
          <>
            Je cherche <b style={{ color: "var(--ink)", fontWeight: 400 }}>« {query} »</b>
          </>
        ) : (
          "Je cherche d'autres images…"
        )}
      </span>
    </div>
  );
}

/** The export: one groove per shot, lit as each one is ready. */
export function Grooves({ done, total, size = 64 }: { done: number; total: number; size?: number }) {
  const n = Math.max(1, Math.min(total, 24));
  const step = (size / 2 - size * 0.16) / n;
  return (
    <svg className="grooves" width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      <circle cx={size / 2} cy={size / 2} r={size / 2} className="bg" />
      {Array.from({ length: n }, (_, i) => {
        const shot = Math.floor((i * total) / n);
        const cls = shot < done ? "ok" : shot === done ? "now" : "";
        return <circle key={i} cx={size / 2} cy={size / 2} r={size / 2 - 3 - i * step} className={`g ${cls}`} strokeWidth={Math.max(1.2, step * 0.62)} />;
      })}
      <circle cx={size / 2} cy={size / 2} r={size * 0.13} className="lab" />
    </svg>
  );
}

/** The video is out: the record slides out of a sleeve, then the download button. */
export function Sleeve({ title, artist, href, onClose }: { title: string; artist: string; href: string; onClose: () => void }) {
  return (
    <div className="sleeve-overlay" role="dialog" aria-label="Vidéo prête" onClick={onClose}>
      <div className="sleeve-card" onClick={(e) => e.stopPropagation()}>
        <button className="btn ghost sm close" onClick={onClose} aria-label="Fermer">
          <X size={16} />
        </button>
        <div className="sleeve">
          <Disc size={134} />
          <div className="cover">
            {title}
            <span>{artist}</span>
          </div>
        </div>
        <span className="eyebrow">Vidéo prête</span>
        <a className="btn primary go-dl" href={href} download onClick={onClose}>
          <Download size={16} /> Télécharger MP4
        </a>
      </div>
    </div>
  );
}

/** A short two-note chime, only if the browser lets the page play sound. */
export function chime() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    void ctx.resume().catch(() => {});
    [659.25, 987.77].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = f;
      const t = ctx.currentTime + i * 0.14;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.12, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      o.connect(g).connect(ctx.destination);
      o.start(t);
      o.stop(t + 0.55);
    });
    setTimeout(() => void ctx.close().catch(() => {}), 1200);
  } catch {}
}
