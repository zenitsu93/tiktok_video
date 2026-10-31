"use client";

import { ENTRANCE_LABELS, ENTRANCES, LAYOUT_LABELS, LAYOUTS, MOVE_LABELS, MOVES, type BeatPatch } from "@regie/core";
import { ArrowLeft, Check, Download, Film, Hand, Image as ImageIcon, ImagePlus, LayoutGrid, List, Loader2, Maximize2, Mic, Minimize2, MoreHorizontal, Pause, Play, RotateCcw, Scissors, Undo2, Wand2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { missingImages, reachable, reading, rewriting, stepOf, STEPS, upToDate, voiceMissing } from "@/lib/steps";
import type { BeatView, VideoView } from "@/lib/view";
import { CopyCaption } from "./caption";
import { DeleteVideo } from "./delete-video";
import { Histoire, tooShort, type ScriptSend } from "./lecture";
import { Planche } from "./planche";
import { PronounceWords, type Notify } from "./pronunciations";
import { SendToTikTok, TikTokTab, tiktokMoving } from "./tiktok-send";
import { StatusChip } from "./status";
import { chime, Disc, Fan, Grooves, LineBusy } from "./waits";

type Job = { kind: "images" | "clean" | "voice" | "rewrite"; query?: string; at: number };

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

/**
 * The montages tried on this video: « ↻ Remonter autrement » draws a new one (same words, voice and images),
 * a pill puts an earlier one back. Style 1 is the montage the video had first.
 */
function Styles({ v, again, pick }: { v: VideoView; again: () => void; pick: (style: number) => void }) {
  const drawing = v.busy.includes("restyle");
  const locked = drawing || v.status === "generating" || v.status === "rendering";
  return (
    <div className="styles" role="group" aria-label="Styles de montage">
      <span className="lbl">Montage</span>
      {Array.from({ length: v.styles }, (_, i) => (
        <button key={i} className={`chip${i === v.styleIndex ? " on" : ""}`} onClick={() => pick(i)} disabled={locked || i === v.styleIndex} aria-pressed={i === v.styleIndex}>
          Style {i + 1}
        </button>
      ))}
      {drawing && (
        <span className="chip draft">
          <Loader2 size={13} className="spin" /> Style {Math.max(2, v.styles + 1)}
        </span>
      )}
      <button className="btn sm" onClick={again} disabled={locked} title="Mêmes mots, même voix, mêmes images : entrées, places du texte, zooms et sorties retirés au sort">
        <RotateCcw size={14} /> Remonter autrement
      </button>
    </div>
  );
}

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

  // a line changed on the worker's side (pronunciation, own image): it comes back within seconds
  const notify: Notify = {
    flash,
    onChange: () => {
      setEager(Date.now() + 15_000);
      void refresh();
    },
  };

  // back from the TikTok sign-in: say how it went, then clean the address
  useEffect(() => {
    const r = new URLSearchParams(location.search).get("tiktok");
    if (!r) return;
    const said: Record<string, [string, boolean]> = {
      ok: ["TikTok connecté. Tu peux envoyer la vidéo.", false],
      scope: ["TikTok est connecté, mais sans le droit d'envoyer des vidéos. Reconnecte et coche l'envoi.", true],
      refus: ["Connexion TikTok annulée.", true],
      config: ["Ajoute TIKTOK_CLIENT_KEY et TIKTOK_CLIENT_SECRET sur le serveur.", true],
    };
    const [text, err] = said[r] ?? ["La connexion à TikTok a échoué. Réessaie.", true];
    flash(text, err);
    history.replaceState(null, "", location.pathname);
  }, [flash]);

  // poll fast while something is moving, slowly otherwise
  const active = v.status === "generating" || v.status === "rendering" || v.busy.length > 0 || tiktokMoving(v) || Date.now() < eager;
  useEffect(() => {
    const id = setInterval(refresh, active ? 2000 : 15000);
    return () => clearInterval(id);
  }, [active, refresh]);

  // open the first shot once, when the shots first appear; after that a closed shot stays closed
  const opened = useRef(Boolean(initial.beats[0]));
  useEffect(() => {
    if (!opened.current && v.beats[0]) {
      opened.current = true;
      setSel(v.beats[0].id);
    }
  }, [v.beats]);

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

  // the export is out: tab title, chime (the TikTok tab opens by itself)
  const prevStatus = useRef(v.status);
  useEffect(() => {
    if (prevStatus.current === "rendering" && v.status === "ready" && v.download) {
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
  // The voice plays here, in the page: a sandboxed frame may not start sound from a click
  // made outside it (Safari, and Chrome on a site it does not know yet). The frame follows it.
  const voice = useRef<HTMLAudioElement>(null);
  // the signed link changes every quarter of an hour: reload only for a new voice, not mid-reading
  const [voiceSrc, setVoiceSrc] = useState(v.voice);
  useEffect(() => {
    if (v.voice?.split("?")[0] === voiceSrc?.split("?")[0]) return;
    setVoiceSrc(v.voice);
    post({ type: "regie:pause" });
  }, [v.voice, voiceSrc, post]);
  useEffect(() => {
    const on = (ev: MessageEvent) => {
      if (typeof ev.data?.type !== "string") return;
      const src = [...refs.current].find(([, el]) => el.contentWindow === ev.source)?.[0];
      if (!src) return;
      if (ev.data.type === "regie:ready" && src === newest) {
        readyFrames.current.add(src);
        const w = refs.current.get(src)?.contentWindow;
        w?.postMessage({ type: "regie:seek", t: voice.current && !voice.current.paused ? voice.current.currentTime : lastT.current }, "*");
        // a frame that takes over while the voice plays picks the reading up
        if (voice.current && !voice.current.paused) w?.postMessage({ type: "regie:play" }, "*");
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
    if (voice.current) voice.current.currentTime = s;
    post({ type: "regie:seek", t: s });
  };

  const togglePlay = () => {
    const a = voice.current;
    if (playing) {
      a?.pause();
      post({ type: "regie:pause" });
      return;
    }
    const from = lastT.current >= v.total - 0.05 ? 0 : lastT.current;
    if (a) {
      a.currentTime = from;
      a.play().catch((e: Error) => flash(`La voix ne démarre pas : ${e.message}`, true));
    }
    post({ type: "regie:seek", t: from });
    post({ type: "regie:play" });
  };
  useEffect(() => {
    const a = voice.current;
    if (!a) return;
    const sync = () => {
      if (!a.paused) post({ type: "regie:sync", t: a.currentTime });
    };
    const stop = () => post({ type: "regie:pause" });
    a.addEventListener("timeupdate", sync);
    a.addEventListener("ended", stop);
    return () => {
      a.removeEventListener("timeupdate", sync);
      a.removeEventListener("ended", stop);
    };
  }, [post, voiceSrc]);

  // a second click on the open shot closes it
  const choose = (b: BeatView) => {
    if (sel === b.id) return setSel(null);
    setSel(b.id);
    seekTo(Math.min(b.end, b.start + 0.9));
  };

  // full screen preview: the browser's own full screen where it exists, a dark overlay otherwise (iPhone)
  const [full, setFull] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const toggleFull = async () => {
    if (full) {
      if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
      setFull(false);
      return;
    }
    setFull(true);
    await stageRef.current?.requestFullscreen?.().catch(() => {});
  };
  useEffect(() => {
    const onChange = () => {
      if (!document.fullscreenElement) setFull(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFull(false);
    };
    document.addEventListener("fullscreenchange", onChange);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

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
  const action = (id: string, a: "images" | "clean" | "voice" | "rewrite", instruction?: string, ok?: string) => {
    track(id, a, a === "images" ? instruction || v.beats.find((b) => b.id === id)?.queries[0] : undefined);
    return run(() => call(`${url}/beats/${id}/${a}`, "POST", instruction ? { instruction } : {}), ok);
  };

  // keyboard: up and down move along the lines (Voix, Images, Montage)
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tab < 1 || tab > 3) return;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        const i = v.beats.findIndex((b) => b.id === sel);
        const n = v.beats[Math.max(0, Math.min(v.beats.length - 1, i + (e.key === "ArrowDown" ? 1 : -1)))];
        if (n && n.id !== sel) {
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
  const { step, who } = stepOf(v);
  const missing = missingImages(v);
  const fresh = upToDate(v);
  // the MP4 only once the voice is approved and the images are there
  const canRender = v.beats.length > 0 && v.status !== "generating" && v.status !== "rendering" && v.status !== "listen";

  // the tab on screen: while the Régie works the reading stays where it is (the voice starts on Histoire,
  // so the text stays in sight); when the hand comes back to Thomas, his step opens
  const [tab, setTab] = useState(() => (who === "run" && step === 1 ? 0 : step));
  const at = useRef(`${step}:${who}`);
  useEffect(() => {
    const k = `${step}:${who}`;
    if (at.current === k) return;
    at.current = k;
    if (who !== "run") setTab(step);
  }, [step, who]);
  // on a phone the Piste scrolls: keep the open tab in sight
  useEffect(() => {
    document.querySelector(".piste .on")?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [tab]);
  const open = (i: number) => {
    setTab(i);
    window.scrollTo?.({ top: 0 });
  };

  // the script while it is read: kept here so « Valider le script » can sit in the action bar
  const [script, setScript] = useState(initial.draft ?? "");
  const savedDraft = useRef(initial.draft ?? "");
  useEffect(() => {
    if (v.draft !== null && v.draft !== savedDraft.current) {
      savedDraft.current = v.draft;
      setScript(v.draft);
    }
  }, [v.draft]);
  const [scriptPending, setScriptPending] = useState(false);
  const sendScript: ScriptSend = async (payload, ok) => {
    setScriptPending(true);
    try {
      await run(() => call(`${url}/script`, "POST", payload).then(refresh), ok);
      savedDraft.current = payload.draft;
    } finally {
      setScriptPending(false);
    }
  };

  // one way to ask Claude about a line: the command route picks a new search or a rewrite
  const askClaude = async (beatId: string, input: string) => {
    try {
      const r = await call(`${url}/command`, "POST", { input, selected: beatId });
      track(r.beatId, r.kind, r.kind === "images" ? r.instruction : undefined);
      setEager(Date.now() + 90_000);
      flash(r.kind === "images" ? "La Régie cherche d'autres images…" : "Claude retouche la phrase…");
      return true;
    } catch (e) {
      flash((e as Error).message, true);
      return false;
    }
  };

  // Images: La Planche for « je cherche moi-même », Le Fil otherwise; both a click away at any time
  const [board, setBoard] = useState<boolean | null>(null);
  const planche = v.beats.length > 0 && (board ?? v.manualImages);

  const render = () =>
    run(() => call(`${url}/render`, "POST", { send: false }), v.download ? "Seuls les plans modifiés repassent au rendu" : "Fabrication du MP4");
  const again = () => run(() => call(`${url}/render`, "POST"), "Fichier refait : il repart sur TikTok tout seul");
  const queued = () => {
    setEager(Date.now() + 15_000);
    void refresh();
  };
  const goMissing = () => {
    const b = missing[0];
    if (!b) return;
    if (tab < 1 || tab > 3) setTab(3);
    choose(b);
    setTimeout(() => document.getElementById(`beat-${b.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
  };

  const lines = v.beats.length ? (
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
          ask={(input) => askClaude(b.id, input)}
          notify={notify}
        />
      ))}
    </div>
  ) : (
    <p className="mute" style={{ margin: 0 }}>
      Les plans arrivent dès que le script est découpé.
    </p>
  );
  const p = v.progress;
  const count = p && p.total > 1 ? `${p.done}/${p.total}` : "";

  let body: React.ReactNode;
  if (tab === 0) body = <Histoire v={v} text={script} setText={setScript} send={sendScript} pending={scriptPending} />;
  else if (tab === 1)
    body = (
      <>
        {v.status === "listen" && (
          <p className="mute" style={{ margin: 0, fontSize: 15 }}>
            Lance l&apos;aperçu (▶). Un mot mal dit : clique la ligne, puis le mot. Une phrase à changer : clique-la. Les images ne sont cherchées qu&apos;après ta
            validation.
          </p>
        )}
        {lines}
      </>
    );
  else if (tab === 2)
    body = (
      <>
        {v.status === "generating" && /image/i.test(p?.step ?? "") && (
          <div className="banner" role="status">
            <Disc size={22} /> La Régie cherche les images {count}. L&apos;aperçu se remplit au fur et à mesure ; une recherche déjà faite est reprise sans payer.
          </div>
        )}
        {v.beats.length > 0 && (
          <div className="seg-views" role="group" aria-label="Affichage des images">
            <button aria-pressed={planche} onClick={() => setBoard(true)}>
              <LayoutGrid size={14} /> La Planche
            </button>
            <button aria-pressed={!planche} onClick={() => setBoard(false)}>
              <List size={14} /> Le Fil
            </button>
          </div>
        )}
        {planche ? <Planche v={v} notify={notify} onSearch={(id) => action(id, "images", undefined, "La Régie cherche pour cette idée…")} /> : lines}
      </>
    );
  else if (tab === 3)
    body = (
      <>
        {v.beats.length > 0 && (
          <Styles
            v={v}
            again={() => run(() => call(`${url}/restyle`, "POST"), "La Régie remonte la vidéo autrement")}
            pick={(style) => run(() => call(`${url}/restyle`, "POST", { style }), `Retour au style ${style + 1}`)}
          />
        )}
        {lines}
      </>
    );
  else if (tab === 4)
    body = (
      <>
        {v.status === "rendering" && p ? (
          <div className="export-progress" role="status">
            <Grooves done={p.done} total={Math.max(1, p.total)} />
            <div>
              <b>
                {p.total > 1 ? p.done : 0}
                <span>/{p.total > 1 ? p.total : "…"}</span>
              </b>
              <div className="mute" style={{ fontSize: 14 }}>
                plans du fichier prêts · seuls les plans modifiés repassent au rendu
              </div>
            </div>
          </div>
        ) : fresh ? (
          <p className="chip ok" style={{ alignSelf: "flex-start" }}>
            <span className="dot" /> Le MP4 est à jour : c&apos;est exactement l&apos;aperçu.
          </p>
        ) : v.download ? (
          <p className="chip warn" style={{ alignSelf: "flex-start", whiteSpace: "normal" }}>
            <span className="dot" /> {v.dirty.length > 0 ? `${v.dirty.length} ${v.dirty.length > 1 ? "plans ont changé" : "plan a changé"} depuis le dernier MP4.` : "La voix a changé depuis le dernier MP4."}
          </p>
        ) : (
          <p className="mute" style={{ margin: 0 }}>
            Le MP4 se fabrique quand l&apos;aperçu te va.
          </p>
        )}
        <p className="mute" style={{ margin: 0, fontSize: 15 }}>
          L&apos;aperçu est déjà la vidéo montée : « Fabriquer le MP4 » en fait seulement le fichier. Pendant la fabrication, tous les onglets restent ouverts ; tu peux
          aussi fermer la page, un carillon et le titre de l&apos;onglet te préviennent.
        </p>
      </>
    );
  else
    body = (
      <TikTokTab v={v} writeCaption={() => run(() => call(`${url}/caption`, "POST").then(refresh), "Claude écrit la légende")} again={again}>
        <Costs v={v} />
      </TikTokTab>
    );

  // the action bar: what is going on, and the one thing to do now, always in the same place
  let msg: React.ReactNode;
  let acts: React.ReactNode = null;
  if (who === "err") {
    // searches that failed: the button says what it does again (only the missing images)
    const images = /^Pas d'images? pour/.test(v.error ?? "");
    msg = (
      <span className="chip hot" role="alert" style={{ whiteSpace: "normal" }}>
        <span className="dot" />
        {v.error ?? "Quelque chose a échoué."}
      </span>
    );
    acts = (
      <>
        {step === 2 && v.beats.length > 0 && (
          <button
            className="btn"
            onClick={() => {
              setBoard(true);
              open(2);
            }}
          >
            <Hand size={15} /> Mettre mes images
          </button>
        )}
        <button
          className="btn primary"
          title={images ? "Relance seulement les recherches des plans sans image : les images déjà trouvées restent" : "Reprend là où ça s'est arrêté : ce qui est déjà fait n'est pas refait"}
          onClick={() => run(() => call(`${url}/resume`, "POST").then(refresh), images ? "Nouvelle recherche lancée" : "Reprise lancée")}
        >
          <RotateCcw size={15} /> {images ? "Réessayer les images" : "Reprendre"}
        </button>
      </>
    );
  } else if (step === 0 && who === "run") {
    msg = (
      <>
        <Disc size={20} />
        <span>
          <b>{rewriting(v) ? "Claude réécrit le script." : "Claude écrit."}</b> Rien à faire : la vidéo passe dans « À toi » quand c&apos;est prêt.
        </span>
      </>
    );
    acts = (
      <Link className="btn" href="/">
        Lancer une autre chanson
      </Link>
    );
  } else if (step === 0) {
    msg = (
      <span>
        <b>Relis l&apos;histoire.</b> Rien n&apos;est dépensé en voix ni en images avant ta validation.
      </span>
    );
    acts = (
      <button className="btn primary lg" disabled={scriptPending || tooShort(script)} onClick={() => void sendScript({ action: "approve", draft: script.trim() }, "Script validé, on lance la suite")}>
        <Check size={17} /> Valider le script
      </button>
    );
  } else if (step === 1 && who === "run") {
    msg = v.beats.length ? (
      <>
        <LineBusy voice />
        <span>
          <b>Voix {count}.</b> Tu peux relire le texte ; l&apos;onglet Voix s&apos;allume quand c&apos;est à toi.
        </span>
      </>
    ) : (
      <>
        <Disc size={20} />
        <span>
          <b>Découpage en plans.</b> Ton texte reste lisible dans Histoire.
        </span>
      </>
    );
    if (v.beats.length && tab !== 1)
      acts = (
        <button className="btn" onClick={() => open(1)}>
          Voir l&apos;onglet Voix
        </button>
      );
  } else if (step === 1) {
    const waitVoice = v.busy.length > 0 || voiceMissing(v);
    msg = (
      <span>
        <b>La voix te va ?</b> Les images ne sont cherchées qu&apos;après.
      </span>
    );
    acts = (
      <>
        <button
          className="btn"
          disabled={waitVoice}
          title={waitVoice ? "Une ligne attend encore sa voix" : "Aucune recherche payante : tu prends les images sur Pinterest (la pochette et la légende sont faites quand même)"}
          onClick={() => {
            setBoard(true);
            void run(() => call(`${url}/voice`, "POST", { manual: true }).then(refresh), "Voix validée : à toi les images");
          }}
        >
          <Hand size={15} /> Je cherche moi-même
        </button>
        <button
          className="btn primary lg"
          disabled={waitVoice}
          title={waitVoice ? "Une ligne attend encore sa voix" : "Pinterest via Apify, environ 1 $ par vidéo"}
          onClick={() => run(() => call(`${url}/voice`, "POST", {}).then(refresh), "Voix validée : recherche des images")}
        >
          <Mic size={17} /> Valider · la Régie cherche
        </button>
      </>
    );
  } else if (step === 2 && who === "run") {
    msg = (
      <>
        <Disc size={20} />
        <span>
          <b>Images {count}.</b> L&apos;aperçu se remplit en direct.
        </span>
      </>
    );
  } else if (step === 2) {
    msg = (
      <span>
        <b>
          {missing.length} {missing.length > 1 ? "images à trouver" : "image à trouver"}.
        </b>{" "}
        Une case par idée ; tu peux aussi laisser la Régie chercher une case.
      </span>
    );
    acts = (
      <button className="btn primary lg" onClick={() => open(3)}>
        Passer au montage
      </button>
    );
  } else if (step === 4 || (step === 3 && who === "run")) {
    msg = (
      <>
        <Disc size={20} />
        <span>
          {step === 4 ? (
            <>
              <b>Fabrication du MP4 {count}.</b> Tu peux continuer à lire, ou fermer : un carillon te prévient.
            </>
          ) : (
            <>
              <b>La Régie remonte la vidéo autrement.</b> Mêmes mots, même voix, mêmes images.
            </>
          )}
        </span>
      </>
    );
    acts = (
      <button className="btn primary lg" disabled>
        <Film size={17} /> {step === 4 ? "Fabrication…" : "Fabriquer le MP4"}
      </button>
    );
  } else if (step === 3) {
    msg = (
      <>
        {missing.length > 0 && (
          <button className="chip warn" onClick={goMissing} title="Aller au premier, puis « Ma photo » ou « Autres images »">
            <span className="dot" />
            {missing.length} {missing.length > 1 ? "plans sans image" : "plan sans image"} → {missing[0]!.id}
          </button>
        )}
        <span>
          <b>L&apos;aperçu est la vidéo finale.</b>{" "}
          {v.download ? "Des plans ont changé depuis le dernier MP4." : "Corrige ce qui ne va pas, sinon fabrique le fichier."}
        </span>
      </>
    );
    acts = (
      <button className="btn primary lg" disabled={!canRender} onClick={render} title="L'aperçu est déjà la vidéo montée : ce bouton en fabrique le fichier MP4 (seuls les plans modifiés)">
        <Film size={17} /> {v.download ? "Refabriquer le MP4" : "Fabriquer le MP4"}
      </button>
    );
  } else {
    const tiktok = v.tiktok.configured && v.tiktok.connected;
    msg =
      who === "done" ? (
        <span>
          <b>Dans ta boîte TikTok.</b> Il reste le son et la légende, dans l&apos;app.
        </span>
      ) : (
        <>
          <span className="chip ok">
            <span className="dot" />
            MP4 à jour
          </span>
          <span>Télécharge-le ou envoie-le sur TikTok.</span>
        </>
      );
    acts =
      who === "done" ? (
        <>
          {v.caption && <CopyCaption text={v.caption} label="Copier la légende" />}
          <Link className="btn dark lg" href="/">
            Vidéo suivante
          </Link>
        </>
      ) : (
        <>
          {v.download && (
            <a className={`btn${tiktok ? "" : " primary lg"}`} href={v.download} download title="Le fichier de la vidéo, telle que dans l'aperçu">
              <Download size={15} /> Télécharger
            </a>
          )}
          <SendToTikTok v={v} onQueued={queued} flash={flash} big />
        </>
      );
  }

  return (
    <div className="fil" style={{ "--side": `${side}px` } as React.CSSProperties}>
      <header className="fil-top">
        <Link href="/" className="btn ghost sm" aria-label="Retour à la file">
          <ArrowLeft size={16} />
        </Link>
        <h1 className="t">
          {v.title} <span>· {v.artist}</span>
        </h1>
        <span className="sp">
          <StatusChip status={v.status}>{v.total > 0 && <span className="mono">{tc(v.total)}</span>}</StatusChip>
          <button className="btn sm" onClick={() => run(() => call(`${url}/undo`, "POST"), "Retour en arrière")} disabled={v.version <= 1 || reading(v)}>
            <Undo2 size={15} /> <span className="wide-only">Annuler</span>
          </button>
          <details className="menu">
            <summary className="btn ghost sm" aria-label="Plus">
              <MoreHorizontal size={16} />
            </summary>
            <div className="menu-pop">
              <DeleteVideo id={v.id} labelled />
            </div>
          </details>
        </span>
      </header>

      <nav className="piste" aria-label="Étapes de la vidéo">
        {STEPS.map((s, i) => {
          const state = i < step || (i === step && who === "done") ? "done" : i === step ? (who === "run" ? "run" : "you") : "todo";
          const note = state === "done" ? "fait" : state === "run" ? "en cours" : state === "you" ? (who === "err" ? "bloqué" : "à toi") : "";
          return (
            <button key={s.title} className={`${state}${tab === i ? " on" : ""}`} disabled={!reachable(v, step, i)} aria-current={tab === i ? "step" : undefined} onClick={() => open(i)}>
              <span className="n">
                {state === "run" && <Disc size={11} label={false} />}0{i + 1} {note}
              </span>
              <span className="tt">{s.title}</span>
              <span className="s">{s.sub}</span>
            </button>
          );
        })}
      </nav>

      <main className="fil-main">{body}</main>

      <aside className="fil-side">
        <Divider width={side} onResize={resize} />
        <div ref={stageRef} className={`stagebox${full ? " full" : ""}`}>
          <div className="phone">
            {v.beats.length === 0 ? (
              <span className="phone-wait">L&apos;aperçu arrive avec la voix</span>
            ) : (
              frames.map((f, i) => (
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
              ))
            )}
          </div>
          {v.beats.length > 0 && (
            <div className="transport">
              <audio ref={voice} src={voiceSrc ?? undefined} preload="auto" />
              <button className="btn sm" onClick={togglePlay} aria-label={playing ? "Pause" : "Lecture"}>
                {playing ? <Pause size={15} /> : <Play size={15} />}
              </button>
              <input
                type="range"
                min={0}
                max={Math.max(0.1, v.total)}
                step={0.05}
                value={Math.min(t, v.total)}
                onChange={(e) => seekTo(Number(e.target.value))}
                aria-label="Position"
                style={{ "--fill": `${(Math.min(t, v.total) / Math.max(0.1, v.total)) * 100}%` } as React.CSSProperties}
              />
              <span className="mono mute">{tc(t)}</span>
              <button className="btn sm" onClick={toggleFull} aria-label={full ? "Quitter le plein écran" : "Plein écran"} title={full ? "Quitter le plein écran (Échap)" : "Plein écran"}>
                {full ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
              </button>
            </div>
          )}
        </div>
        <div className="side-extra">
          {v.angle && (
            <div className="panel">
              <span className="eyebrow">Angle</span>
              <span>{v.angle}</span>
            </div>
          )}
          <button className="panel cost-mini" onClick={() => open(5)} disabled={!reachable(v, step, 5)} title="Le détail est dans l'onglet TikTok">
            <span className="eyebrow">Ce que coûte cette vidéo</span>
            <span className="mono">{usd(v.spent)}</span>
          </button>
        </div>
      </aside>

      <footer className="actbar">
        <div className="msg">{msg}</div>
        {acts && <div className="acts">{acts}</div>}
      </footer>

      {toast && (
        <div className={`toast${toast.err ? " err" : ""}`} role="status">
          {toast.text}
        </div>
      )}
    </div>
  );
}

function Line({ b, accent }: { b: BeatView; accent: string | null }) {
  if (!b.hero) return b.italic ? <i>{b.text}</i> : <>{b.text}</>;
  const i = b.text.toLowerCase().indexOf(b.hero.toLowerCase());
  if (i < 0) return <>{b.text}</>;
  return (
    <>
      {b.text.slice(0, i)}
      <b style={b.italic ? { fontStyle: "italic" } : b.accent && accent ? { color: accent } : undefined}>{b.text.slice(i, i + b.hero.length)}</b>
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
  ask,
  notify,
}: {
  b: BeatView;
  v: VideoView;
  selected: boolean;
  current: boolean;
  job?: Job;
  onChoose: () => void;
  patch: (p: BeatPatch, ok?: string) => void;
  action: (a: "images" | "clean" | "voice" | "rewrite", instruction?: string, ok?: string) => void;
  ask: (input: string) => Promise<boolean>;
  notify: Notify;
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
      {selected && <Inspector b={b} v={v} busy={busy} job={job} patch={patch} action={action} ask={ask} notify={notify} />}
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
  ask,
  notify,
}: {
  b: BeatView;
  v: VideoView;
  busy: boolean;
  job?: Job;
  patch: (p: BeatPatch, ok?: string) => void;
  action: (a: "images" | "clean" | "voice" | "rewrite", instruction?: string, ok?: string) => void;
  ask: (input: string) => Promise<boolean>;
  notify: Notify;
}) {
  const [text, setText] = useState(b.text);
  useEffect(() => setText(b.text), [b.text]);
  // the one way to ask Claude about this line: a new search or a rewrite, Claude's route decides
  const [wish, setWish] = useState("");
  const [asking, setAsking] = useState(false);
  const sendAsk = async () => {
    if (!wish.trim() || asking) return;
    setAsking(true);
    if (await ask(wish.trim())) setWish("");
    setAsking(false);
  };
  const [drag, setDrag] = useState(false);
  // « Ma photo »: the file goes as it is, the worker cleans it and shows it on this line
  async function upload(f: File) {
    if (f.size > 9_500_000) return notify.flash("Fichier trop lourd (9 Mo au plus).", true);
    try {
      const r = await fetch(`/api/videos/${v.id}/beats/${b.id}/image`, { method: "POST", headers: { "content-type": f.type }, body: f });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error ?? `Erreur ${r.status}`);
      notify.flash("Ta photo arrive sur ce plan");
      notify.onChange();
    } catch (e) {
      notify.flash(e instanceof Error ? e.message : "Envoi impossible", true);
    }
  }
  const words = b.text.split(/\s+/).map((w) => w.replace(/^[«"“(]+|[.,;:!?…»"”)]+$/g, "")).filter(Boolean);
  const changed = text.trim() !== b.text;
  const imageLayouts = b.layout === "card" || b.layout === "cutout";
  // the candidate shown now, and its cut-out version when there is one
  const current = b.candidates.find((c) => c === b.image || (v.images[c]?.clean && v.images[c]?.clean === b.image));
  const cutId = current ? v.images[current]?.clean : undefined;
  const isClean = Boolean(cutId && b.image === cutId);
  const cleaning = job?.kind === "clean";

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
        <span className="lab">Prononciation · clique un mot</span>
        <PronounceWords b={b} v={v} words={words} notify={notify} />
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

      <div
        className={`grp${drag ? " drop" : ""}`}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes("Files")) {
            e.preventDefault();
            setDrag(true);
          }
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          const f = e.dataTransfer.files[0];
          if (f) void upload(f);
        }}
      >
        <span className="lab">Image</span>
        {job?.kind === "images" && <Fan query={job.query} />}
        {b.candidates.length > 0 && (
          <div className="cands">
            {b.candidates.map((c) => {
              const img = v.images[c];
              if (!img) return null;
              const cut = img.clean ? v.images[img.clean] : undefined;
              const pressed = c === current;
              // a pin that came on a checkerboard is shown cut out, unless « Original » was chosen
              const showCut = Boolean(cut && (pressed ? isClean : img.checker));
              const pick = () =>
                patch(
                  showCut && img.clean
                    ? { image: img.clean, layout: b.layout === "card" || !imageLayouts ? "cutout" : b.layout }
                    : // leaving a cut-out for a plain picture puts it back in a card
                      { image: c, ...(!imageLayouts || (isClean && b.layout === "cutout") ? { layout: "card" as const } : {}) },
                );
              return (
                <button key={c} aria-pressed={pressed} onClick={pick} aria-label={showCut ? "Choisir cette image, fond nettoyé" : "Choisir cette image"} className={showCut ? "cut" : undefined}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={(showCut ? cut! : img).url} alt="" loading="lazy" />
                  {img.clip && (
                    <span className="clipmark" aria-label="GIF ou vidéo">
                      <Play size={10} />
                    </span>
                  )}
                  {showCut && (
                    <span className="scissors" aria-hidden="true">
                      <Scissors size={11} />
                    </span>
                  )}
                  {pressed && cleaning && <span className="shimmer" aria-hidden="true" />}
                </button>
              );
            })}
          </div>
        )}
        {current && imageLayouts && !v.images[current]?.clip && (
          <div className="bgrow">
            <div className="bgseg" data-v={isClean ? "clean" : "orig"} role="group" aria-label="Fond de l'image">
              <span className="thumb" aria-hidden="true" />
              <button
                aria-pressed={!isClean}
                disabled={busy}
                onClick={() => isClean && patch({ image: current, ...(b.layout === "cutout" ? { layout: "card" as const } : {}) }, "Image d'origine remise")}
              >
                Original
              </button>
              <button
                aria-pressed={isClean}
                disabled={busy}
                onClick={() => {
                  if (isClean) return;
                  if (cutId) patch({ image: cutId, layout: b.layout === "card" ? "cutout" : b.layout }, "Fond nettoyé");
                  else action("clean", undefined, "Détourage en cours…");
                }}
              >
                {cleaning && <Loader2 size={13} className="spin" />} Fond nettoyé
              </button>
            </div>
            <span className="mute" style={{ fontSize: 13 }}>
              {cleaning ? "Détourage en cours…" : isClean && v.images[current]?.checker ? "Damier repéré, fond enlevé tout seul." : isClean ? "Sujet posé sur le blanc." : ""}
            </span>
          </div>
        )}
        <div className="chips">
          <button className="btn sm" disabled={busy} onClick={() => action("images", undefined, "Recherche d'autres images…")}>
            <ImageIcon size={14} /> Autres images
          </button>
          <label className={`btn sm${busy ? " off" : ""}`} title="Ta propre image, un GIF ou une courte vidéo, depuis ton ordinateur ou ton téléphone (ou glisse-le ici)">
            <ImagePlus size={14} /> Ma photo
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,video/webm"
              hidden
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void upload(f);
              }}
            />
          </label>
          {b.queries.length > 0 && <span className="mute" style={{ fontSize: 13, alignSelf: "center" }}>« {b.queries.join(" », « ")} »</span>}
        </div>
      </div>

      {v.providers.claude && (
        <form
          className="ask-bar"
          onSubmit={(e) => {
            e.preventDefault();
            void sendAsk();
          }}
        >
          <Wand2 size={15} className="mute" />
          <input
            value={wish}
            onChange={(e) => setWish(e.target.value)}
            maxLength={500}
            placeholder="Demander à Claude : « une photo plus vieille », « plus court »…"
            aria-label={`Demander à Claude pour ${b.id}`}
            disabled={busy}
          />
          <button className="btn dark sm" type="submit" disabled={busy || asking || !wish.trim()}>
            {asking ? <Loader2 size={14} className="spin" /> : null} Envoyer
          </button>
        </form>
      )}

      <details className="retouches">
        <summary>Retouches de montage · page, entrée, geste, pause (choisies toutes seules)</summary>
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
          <span className="lab">Geste</span>
          <div className="chips">
            {MOVES.map((m) => (
              <button key={m} className="pick" aria-pressed={b.move === m} onClick={() => patch({ move: m })}>
                {MOVE_LABELS[m]}
              </button>
            ))}
          </div>
        </div>
        <div className="grp">
          <span className="lab">Texte</span>
          <div className="chips" style={{ alignItems: "center" }}>
            <button className="pick" aria-pressed={b.reveal === "type"} onClick={() => patch({ reveal: b.reveal === "type" ? "fade" : "type" })}>
              {b.reveal === "type" ? "Lettres tapées" : "Gris puis noir"}
            </button>
            <button className="pick" aria-pressed={b.accent} onClick={() => patch({ accent: !b.accent })}>
              Couleur de l&apos;image sur le mot
            </button>
            <button
              className="pick"
              aria-pressed={b.italic}
              onClick={() => patch({ italic: !b.italic })}
              title="Pour un titre de chanson ou un mot d'aveu, environ une phrase sur cinq"
              style={{ fontStyle: "italic" }}
            >
              Italique
            </button>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 14 }}>
              Pause après
              <input
                type="range"
                min={0}
                max={3}
                step={0.1}
                defaultValue={b.gap}
                key={`${b.id}-${b.gap}`}
                style={{ "--fill": `${(b.gap / 3) * 100}%` } as React.CSSProperties}
                onInput={(e) => e.currentTarget.style.setProperty("--fill", `${(Number(e.currentTarget.value) / 3) * 100}%`)}
                onPointerUp={(e) => patch({ gap: Number((e.target as HTMLInputElement).value) })}
                onKeyUp={(e) => patch({ gap: Number((e.target as HTMLInputElement).value) })}
              />
              <span className="mono">{b.gap.toFixed(1)} s</span>
            </label>
          </div>
        </div>
      </details>

      <div className="chips">
        <button className="btn sm" disabled={busy} onClick={() => action("voice", undefined, "La voix de cette phrase se refait")}>
          <Mic size={14} /> Refaire la voix
        </button>
      </div>
    </div>
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
