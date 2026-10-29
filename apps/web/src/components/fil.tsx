"use client";

import { ENTRANCE_LABELS, ENTRANCES, LAYOUT_LABELS, LAYOUTS, type BeatPatch } from "@regie/core";
import { ArrowLeft, Download, Image as ImageIcon, Loader2, Mic, Pause, Play, Send, Sparkles, Undo2, Wand2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { BeatView, VideoView } from "@/lib/view";
import { StatusChip } from "./status";
import { chime, Fan, Grooves, LineBusy, Platine, Sleeve, stageOf } from "./waits";

type Job = { kind: "images" | "voice" | "rewrite"; query?: string; at: number };

const SIDE_DEFAULT = 360;
const clampSide = (w: number) => Math.round(Math.min(Math.max(w, 260), Math.max(260, Math.min(900, (typeof window === "undefined" ? 1400 : window.innerWidth) - 420))));

/** The bar between the script and the preview: drag it, use the arrow keys, double-click to reset. */
function Divider({ width, onResize }: { width: number; onResize: (w: number) => void }) {
  const start = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const x0 = e.clientX;
    const w0 = width;
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    document.body.classList.add("resizing");
    const move = (ev: PointerEvent) => onResize(w0 + (x0 - ev.clientX));
    const up = () => {
      document.body.classList.remove("resizing");
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
  };
  return (
    <div
      className="divider"
      role="separator"
      aria-orientation="vertical"
      aria-label="Largeur de l'aperçu"
      aria-valuenow={width}
      aria-valuemin={260}
      aria-valuemax={900}
      tabIndex={0}
      title="Glisse pour agrandir ou réduire l'aperçu (double-clic : taille normale)"
      onPointerDown={start}
      onDoubleClick={() => onResize(SIDE_DEFAULT)}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") onResize(width + 20);
        if (e.key === "ArrowRight") onResize(width - 20);
      }}
    />
  );
}

const tc = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;
const usd = (n: number) => `${n.toFixed(n < 1 ? 3 : 2)} $`;

async function call(url: string, method: string, payload?: unknown) {
  const r = await fetch(url, {
    method,
    headers: payload === undefined ? undefined : { "Content-Type": "application/json" },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error ?? `Erreur ${r.status}`);
  return data;
}

/**
 * Le Fil: the script is the interface. One sentence is one shot; clicking it jumps
 * the preview there and opens its settings. Hand edits are free; only the voice,
 * new images and Claude rewrites go to the worker.
 */
export function Fil({ initial }: { initial: VideoView }) {
  const [v, setV] = useState(initial);
  const [sel, setSel] = useState<string | null>(initial.beats[0]?.id ?? null);
  const [toast, setToast] = useState<{ text: string; err?: boolean } | null>(null);
  const [eager, setEager] = useState(0);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [jobs, setJobs] = useState<Record<string, Job>>({});
  const [side, setSide] = useState(SIDE_DEFAULT);
  useEffect(() => {
    try {
      const w = Number(localStorage.getItem("regie:side"));
      if (w) setSide(clampSide(w));
    } catch {}
  }, []);
  const resize = (w: number) => {
    const c = clampSide(w);
    setSide(c);
    try {
      localStorage.setItem("regie:side", String(c));
    } catch {}
  };
  const [done, setDone] = useState(false);
  // the preview: the previous frame stays, blurred, until the new one is ready
  const [frames, setFrames] = useState<{ src: string; ready: boolean }[]>([{ src: initial.preview, ready: false }]);
  const refs = useRef(new Map<string, HTMLIFrameElement>());
  const readyFrames = useRef(new Set<string>());
  const lastT = useRef(0);
  const url = `/api/videos/${v.id}`;

  const flash = useCallback((text: string, err = false) => {
    setToast({ text, err });
    setTimeout(() => setToast(null), err ? 6000 : 2600);
  }, []);

  const refresh = useCallback(async () => {
    try {
      setV(await call(url, "GET"));
    } catch {}
  }, [url]);

  // poll fast while something is moving, slowly otherwise
  const active = v.status === "generating" || v.status === "rendering" || v.busy.length > 0 || Date.now() < eager;
  useEffect(() => {
    const id = setInterval(refresh, active ? 2000 : 15000);
    return () => clearInterval(id);
  }, [active, refresh]);

  useEffect(() => {
    if (!sel && v.beats[0]) setSel(v.beats[0].id);
  }, [v.beats, sel]);

  const track = (id: string, kind: Job["kind"], query?: string) => setJobs((j) => ({ ...j, [id]: { kind, query, at: Date.now() } }));
  // forget a job once its line is free again (a few seconds of grace while it waits in the queue)
  useEffect(() => {
    setJobs((j) => {
      const keep = Object.entries(j).filter(([id, job]) => v.busy.includes(id) || Date.now() - job.at < 8000);
      return keep.length === Object.keys(j).length ? j : Object.fromEntries(keep);
    });
  }, [v]);

  useEffect(() => {
    setFrames((f) => (f.at(-1)?.src === v.preview ? f : [...f.slice(-1), { src: v.preview, ready: false }]));
  }, [v.preview]);

  // the export is out: sleeve, tab title, chime
  const prevStatus = useRef(v.status);
  useEffect(() => {
    if (prevStatus.current === "rendering" && v.status === "ready" && v.download) {
      setDone(true);
      chime();
      if (document.hidden) document.title = `✓ Prête · ${v.title}`;
    }
    prevStatus.current = v.status;
  }, [v.status, v.download, v.title]);
  useEffect(() => {
    const back = () => {
      if (!document.hidden && document.title.startsWith("✓")) document.title = `${v.title} · Régie`;
    };
    document.addEventListener("visibilitychange", back);
    return () => document.removeEventListener("visibilitychange", back);
  }, [v.title]);

  // preview frame: it talks only through postMessage, and only messages from that frame count
  const newest = frames.at(-1)!.src;
  const post = useCallback((msg: object) => refs.current.get(newest)?.contentWindow?.postMessage(msg, "*"), [newest]);
  useEffect(() => {
    const on = (ev: MessageEvent) => {
      if (typeof ev.data?.type !== "string") return;
      const src = [...refs.current].find(([, el]) => el.contentWindow === ev.source)?.[0];
      if (!src) return;
      if (ev.data.type === "regie:ready" && src === newest) {
        readyFrames.current.add(src);
        refs.current.get(src)?.contentWindow?.postMessage({ type: "regie:seek", t: lastT.current }, "*");
        setFrames((f) => f.map((x) => (x.src === src ? { ...x, ready: true } : x)));
        setTimeout(() => setFrames((f) => (f.at(-1)?.src === src ? f.slice(-1) : f)), 300);
      }
      // a new frame reports t=0 while it boots: only listen once it has taken over
      if (ev.data.type === "regie:time" && src === newest && readyFrames.current.has(src)) {
        lastT.current = ev.data.t;
        setT(ev.data.t);
        setPlaying(Boolean(ev.data.playing));
      }
    };
    addEventListener("message", on);
    return () => removeEventListener("message", on);
  }, [newest]);

  const seekTo = (s: number) => {
    lastT.current = s;
    post({ type: "regie:seek", t: s });
  };

  const choose = (b: BeatView) => {
    setSel(b.id);
    seekTo(Math.min(b.end, b.start + 0.9));
  };

  async function run(fn: () => Promise<unknown>, ok?: string) {
    try {
      const r = await fn();
      if (r && typeof r === "object" && "beats" in r) setV(r as VideoView);
      setEager(Date.now() + 90_000);
      if (ok) flash(ok);
    } catch (e) {
      flash((e as Error).message, true);
    }
  }

  const patch = (id: string, p: BeatPatch, ok?: string) => {
    if (p.text !== undefined) track(id, "voice");
    return run(() => call(`${url}/beats/${id}`, "PATCH", p), ok);
  };
  const action = (id: string, a: "images" | "voice" | "rewrite", instruction?: string, ok?: string) => {
    track(id, a, a === "images" ? instruction || v.beats.find((b) => b.id === id)?.queries[0] : undefined);
    return run(() => call(`${url}/beats/${id}/${a}`, "POST", instruction ? { instruction } : {}), ok);
  };

  // keyboard: up and down move along the script, "/" goes to the command bar
  const cmd = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "/") {
        e.preventDefault();
        cmd.current?.focus();
      }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        const i = v.beats.findIndex((b) => b.id === sel);
        const n = v.beats[Math.max(0, Math.min(v.beats.length - 1, i + (e.key === "ArrowDown" ? 1 : -1)))];
        if (n) {
          e.preventDefault();
          choose(n);
          document.getElementById(`beat-${n.id}`)?.scrollIntoView({ block: "nearest" });
        }
      }
    };
    addEventListener("keydown", on);
    return () => removeEventListener("keydown", on);
  });

  const nowBeat = v.beats.findLast((b) => b.start <= t + 0.01)?.id;
  // the first pass, from "Lancer" to the first MP4
  // (between the last image and the export job starting, the video is briefly "ready" without an MP4)
  const firstRun = !v.download && (v.status === "generating" || v.status === "rendering" || (v.status === "ready" && v.beats.length > 0 && !v.costs.some((c) => c.provider === "render")));
  const voiceMissing = v.beats.some((b) => b.voiceStale);
  const canRender = v.beats.length > 0 && v.status !== "generating" && v.status !== "rendering";
  const upToDate = Boolean(v.download) && v.dirty.length === 0 && !voiceMissing;

  return (
    <div className="fil" style={{ "--side": `${side}px` } as React.CSSProperties}>
      <main className="fil-main">
        <header className="fil-head">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Link href="/" className="btn ghost sm" aria-label="Retour aux vidéos">
              <ArrowLeft size={16} />
            </Link>
            <h1 className="t">
              {v.title} <span>· {v.artist}</span>
            </h1>
          </div>
          <div className="meta">
            <StatusChip status={v.status}>{v.total > 0 && <span className="mono">{tc(v.total)}</span>}</StatusChip>
            {v.angle && <span className="chip">angle : {v.angle}</span>}
            {v.download && v.dirty.length > 0 && (
              <span className="chip hot">
                <span className="dot" />
                {v.dirty.length} {v.dirty.length > 1 ? "plans à re-rendre" : "plan à re-rendre"}
              </span>
            )}
            <span style={{ marginLeft: "auto" }} />
            <button className="btn sm" onClick={() => run(() => call(`${url}/undo`, "POST"), "Retour en arrière")} disabled={v.version <= 1}>
              <Undo2 size={15} /> Annuler
            </button>
            {upToDate && v.download ? (
              <a className="btn primary sm" href={v.download} download>
                <Download size={15} /> Télécharger MP4
              </a>
            ) : (
              <button
                className="btn primary sm"
                disabled={!canRender}
                onClick={() => run(() => call(`${url}/render`, "POST"), v.download ? "Seuls les plans modifiés repassent au rendu" : "Montage lancé")}
              >
                {v.status === "rendering" ? <Loader2 size={15} className="spin" /> : <Sparkles size={15} />}
                {v.status === "rendering" ? "Montage…" : v.download ? "Mettre à jour le MP4" : "Exporter le MP4"}
              </button>
            )}
            {v.download && !upToDate && (
              <a className="btn ghost sm" href={v.download} download title="Dernier export">
                <Download size={15} />
              </a>
            )}
          </div>
          {firstRun ? (
            <Platine
              stage={stageOf(v.progress?.step, v.status === "rendering")}
              detail={v.progress && v.progress.total > 1 ? `${v.progress.done}/${v.progress.total}` : undefined}
              compact={v.beats.length > 0}
            />
          ) : (
            v.status === "rendering" &&
            v.progress && (
              <div className="export-progress" role="status">
                <Grooves done={v.progress.done} total={Math.max(1, v.progress.total)} />
                <div>
                  <b>
                    {v.progress.total > 1 ? v.progress.done : 0}
                    <span>/{v.progress.total > 1 ? v.progress.total : "…"}</span>
                  </b>
                  <div className="mute" style={{ fontSize: 14 }}>
                    plans prêts · seuls les plans modifiés repassent au rendu
                  </div>
                </div>
              </div>
            )
          )}
          {v.error && (
            <p className="chip hot" role="alert" style={{ whiteSpace: "normal", alignSelf: "flex-start" }}>
              {v.error}
            </p>
          )}
        </header>

        {v.beats.length === 0 && v.status === "generating" && (
          <p className="mute" style={{ fontSize: 18, margin: 0 }}>
            Claude écrit l&apos;histoire. Les phrases apparaissent ici dès que le script est découpé.
          </p>
        )}

        <div className="beats">
          {v.beats.map((b) => (
            <BeatRow
              key={b.id}
              b={b}
              v={v}
              selected={sel === b.id}
              current={nowBeat === b.id}
              onChoose={() => choose(b)}
              job={jobs[b.id]}
              patch={(p, ok) => patch(b.id, p, ok)}
              action={(a, i, ok) => action(b.id, a, i, ok)}
            />
          ))}
        </div>

        {v.sources.length > 0 && (
          <details className="panel" style={{ marginTop: 10 }}>
            <summary style={{ cursor: "pointer", fontWeight: 400 }}>Sources du script ({v.sources.length})</summary>
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
        )}

        <Dock
          v={v}
          sel={sel}
          inputRef={cmd}
          onSent={(r) => {
            track(r.beatId, r.kind, r.kind === "images" ? r.instruction : undefined);
            void run(async () => null, `Correction envoyée sur ${r.beatId}`);
          }}
          onError={(m) => flash(m, true)}
        />
      </main>

      <aside className="fil-side">
        <Divider width={side} onResize={resize} />
        <div className="phone">
          {frames.map((f, i) => (
            <iframe
              key={f.src}
              ref={(el) => {
                if (el) refs.current.set(f.src, el);
                else refs.current.delete(f.src);
              }}
              src={f.src}
              title="Aperçu de la vidéo"
              sandbox="allow-scripts"
              className={!f.ready ? "loading" : i < frames.length - 1 ? "stale" : undefined}
              aria-hidden={i < frames.length - 1 || undefined}
            />
          ))}
        </div>
        <div className="transport">
          <button className="btn sm" onClick={() => post({ type: playing ? "regie:pause" : "regie:play" })} aria-label={playing ? "Pause" : "Lecture"}>
            {playing ? <Pause size={15} /> : <Play size={15} />}
          </button>
          <input type="range" min={0} max={Math.max(0.1, v.total)} step={0.05} value={Math.min(t, v.total)} onChange={(e) => seekTo(Number(e.target.value))} aria-label="Position" />
          <span className="mono mute">{tc(t)}</span>
        </div>
        <Costs v={v} />
      </aside>

      {done && v.download && <Sleeve title={v.title} artist={v.artist} href={v.download} onClose={() => setDone(false)} />}

      {toast && (
        <div className={`toast${toast.err ? " err" : ""}`} role="status">
          {toast.text}
        </div>
      )}
    </div>
  );
}

function Line({ b, accent }: { b: BeatView; accent: string | null }) {
  if (!b.hero) return <>{b.text}</>;
  const i = b.text.toLowerCase().indexOf(b.hero.toLowerCase());
  if (i < 0) return <>{b.text}</>;
  return (
    <>
      {b.text.slice(0, i)}
      <b style={b.accent && accent ? { color: accent } : undefined}>{b.text.slice(i, i + b.hero.length)}</b>
      {b.text.slice(i + b.hero.length)}
    </>
  );
}

function BeatRow({
  b,
  v,
  selected,
  current,
  job,
  onChoose,
  patch,
  action,
}: {
  b: BeatView;
  v: VideoView;
  selected: boolean;
  current: boolean;
  job?: Job;
  onChoose: () => void;
  patch: (p: BeatPatch, ok?: string) => void;
  action: (a: "images" | "voice" | "rewrite", instruction?: string, ok?: string) => void;
}) {
  const img = b.image ? v.images[b.image] : b.layout === "vinyl" && v.cover ? v.images[v.cover] : undefined;
  const busy = v.busy.includes(b.id) || Boolean(job);
  const dirty = v.dirty.includes(b.id);
  return (
    <div id={`beat-${b.id}`} className={`beat${selected ? " sel" : ""}${current ? " playing" : ""}`}>
      <button className="row" onClick={onChoose} aria-expanded={selected}>
        <span className="tc mono">
          {b.id}
          <br />
          {tc(b.start)}
        </span>
        <span className="th" style={img ? { backgroundImage: `url(${img.url})` } : undefined}>
          {!img && <span style={{ fontSize: 11, textTransform: "uppercase" }}>{LAYOUT_LABELS[b.layout].split(" ")[0]}</span>}
        </span>
        <span className="line">
          <Line b={b} accent={img?.accent ?? null} />
        </span>
        <span className="side">
          {busy && <LineBusy voice={job ? job.kind === "voice" : b.voiceStale} />}
          {!busy && b.voiceStale && (
            <span className="chip warn" title="La voix ne correspond pas encore au texte">
              <span className="dot" />
              voix
            </span>
          )}
          {!busy && dirty && (
            <span className="chip hot" title="Ce plan a changé depuis le dernier export">
              <span className="dot" />
            </span>
          )}
        </span>
      </button>
      {selected && <Inspector b={b} v={v} busy={busy} job={job} patch={patch} action={action} />}
    </div>
  );
}

function Inspector({
  b,
  v,
  busy,
  job,
  patch,
  action,
}: {
  b: BeatView;
  v: VideoView;
  busy: boolean;
  job?: Job;
  patch: (p: BeatPatch, ok?: string) => void;
  action: (a: "images" | "voice" | "rewrite", instruction?: string, ok?: string) => void;
}) {
  const [text, setText] = useState(b.text);
  useEffect(() => setText(b.text), [b.text]);
  const words = b.text.split(/\s+/).map((w) => w.replace(/^[«"“(]+|[.,;:!?…»"”)]+$/g, "")).filter(Boolean);
  const changed = text.trim() !== b.text;
  const imageLayouts = b.layout === "card" || b.layout === "cutout";

  return (
    <div className="insp">
      <div className="grp">
        <label htmlFor={`txt-${b.id}`}>Texte (la voix suit)</label>
        <textarea
          id={`txt-${b.id}`}
          value={text}
          maxLength={400}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && changed) {
              e.preventDefault();
              patch({ text: text.trim() }, "Texte changé, la voix de cette phrase se refait");
            }
          }}
        />
        {changed && (
          <div style={{ display: "flex", gap: 6 }}>
            <button className="btn dark sm" onClick={() => patch({ text: text.trim() }, "Texte changé, la voix de cette phrase se refait")}>
              Enregistrer
            </button>
            <button className="btn ghost sm" onClick={() => setText(b.text)}>
              Annuler
            </button>
          </div>
        )}
      </div>

      <div className="grp">
        <span className="lab">Mot en grand</span>
        <div className="words">
          {[...new Set(words)].map((w) => (
            <button key={w} aria-pressed={b.hero.toLowerCase() === w.toLowerCase()} onClick={() => patch({ hero: b.hero.toLowerCase() === w.toLowerCase() ? "" : w })}>
              {w}
            </button>
          ))}
        </div>
      </div>

      <div className="grp">
        <span className="lab">Image</span>
        {job?.kind === "images" && <Fan query={job.query} />}
        {b.candidates.length > 0 && (
          <div className="cands">
            {b.candidates.map((c) =>
              v.images[c] ? (
                <button key={c} aria-pressed={b.image === c} onClick={() => patch({ image: c, ...(imageLayouts ? {} : { layout: "card" as const }) })} aria-label="Choisir cette image">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={v.images[c].url} alt="" loading="lazy" />
                </button>
              ) : null,
            )}
          </div>
        )}
        <div className="chips">
          <button className="btn sm" disabled={busy} onClick={() => action("images", undefined, "Recherche d'autres images…")}>
            <ImageIcon size={14} /> Autres images
          </button>
          {b.queries.length > 0 && <span className="mute" style={{ fontSize: 13, alignSelf: "center" }}>« {b.queries.join(" », « ")} »</span>}
        </div>
      </div>

      <div className="grp">
        <span className="lab">Mise en page</span>
        <div className="chips">
          {LAYOUTS.map((l) => (
            <button key={l} className="pick" aria-pressed={b.layout === l} onClick={() => patch({ layout: l })}>
              {LAYOUT_LABELS[l]}
            </button>
          ))}
        </div>
      </div>

      <div className="grp">
        <span className="lab">Entrée</span>
        <div className="chips">
          {ENTRANCES.map((en) => (
            <button key={en} className="pick" aria-pressed={b.entrance === en} onClick={() => patch({ entrance: en })}>
              {ENTRANCE_LABELS[en]}
            </button>
          ))}
        </div>
      </div>

      <div className="grp">
        <span className="lab">Réglages</span>
        <div className="chips" style={{ alignItems: "center" }}>
          <button className="pick" aria-pressed={b.reveal === "type"} onClick={() => patch({ reveal: b.reveal === "type" ? "fade" : "type" })}>
            {b.reveal === "type" ? "Lettres tapées" : "Gris puis noir"}
          </button>
          <button className="pick" aria-pressed={b.accent} onClick={() => patch({ accent: !b.accent })}>
            Couleur de l&apos;image sur le mot
          </button>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 14 }}>
            Pause après
            <input type="range" min={0} max={3} step={0.1} defaultValue={b.gap} key={`${b.id}-${b.gap}`} onPointerUp={(e) => patch({ gap: Number((e.target as HTMLInputElement).value) })} onKeyUp={(e) => patch({ gap: Number((e.target as HTMLInputElement).value) })} style={{ accentColor: "var(--accent)" }} />
            <span className="mono">{b.gap.toFixed(1)} s</span>
          </label>
        </div>
      </div>

      <div className="chips">
        <button className="btn sm" disabled={busy} onClick={() => action("voice", undefined, "La voix de cette phrase se refait")}>
          <Mic size={14} /> Refaire la voix
        </button>
        {v.providers.claude && (
          <button
            className="btn sm"
            disabled={busy}
            onClick={() => {
              const i = window.prompt("Que doit changer Claude sur cette phrase ?");
              if (i?.trim()) action("rewrite", i.trim(), "Claude retouche la phrase…");
            }}
          >
            <Wand2 size={14} /> Retoucher avec Claude
          </button>
        )}
      </div>
    </div>
  );
}

function Dock({
  v,
  sel,
  inputRef,
  onSent,
  onError,
}: {
  v: VideoView;
  sel: string | null;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onSent: (r: { beatId: string; kind: "images" | "rewrite"; instruction: string }) => void;
  onError: (m: string) => void;
}) {
  const [value, setValue] = useState("");
  const [sending, setSending] = useState(false);
  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!value.trim()) return;
    setSending(true);
    try {
      const r = await call(`/api/videos/${v.id}/command`, "POST", { input: value, selected: sel });
      setValue("");
      onSent(r);
    } catch (err) {
      onError((err as Error).message);
    } finally {
      setSending(false);
    }
  }
  return (
    <form className="dock" onSubmit={send}>
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        maxLength={500}
        placeholder={v.providers.claude ? `${sel ? `@${sel} ` : "@b08 "}une photo plus vieille, en noir et blanc` : "Mode démo : « @b08 images » cherche d'autres images"}
        aria-label="Correction"
      />
      <span className="mono mute" aria-hidden>
        /
      </span>
      <button className="btn dark sm" disabled={sending || !value.trim()}>
        {sending ? <Loader2 size={14} className="spin" /> : <Send size={14} />} Corriger
      </button>
    </form>
  );
}

function Costs({ v }: { v: VideoView }) {
  const by = (p: string) => v.costs.filter((c) => c.provider === p);
  const sum = (rows: VideoView["costs"]) => rows.reduce((s, c) => s + c.cost, 0);
  const calls = (rows: VideoView["costs"]) => rows.reduce((s, c) => s + c.calls, 0);
  const rows: [string, VideoView["costs"], string][] = [
    ["Claude", by("claude"), v.providers.claude ? "" : "démo"],
    ["Voix ElevenLabs", by("elevenlabs"), v.providers.voice ? "" : "démo"],
    ["Images Apify", by("apify"), v.providers.images ? "" : "démo"],
  ];
  return (
    <div className="panel">
      <div className="r">
        <b style={{ fontWeight: 500 }}>Ce que coûte cette vidéo</b>
        <span className="mono">{usd(v.spent)}</span>
      </div>
      {rows.map(([label, r, demo]) => (
        <div className="r" key={label}>
          <span>
            {label} {demo && <span className="mute">({demo})</span>}
          </span>
          <span className="mono mute">
            {calls(r)} appel{calls(r) > 1 ? "s" : ""} · {usd(sum(r))}
          </span>
        </div>
      ))}
      <div className="r">
        <span>Exports</span>
        <span className="mono mute">{calls(by("render"))}</span>
      </div>
    </div>
  );
}
