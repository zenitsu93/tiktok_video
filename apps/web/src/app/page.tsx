import { getDb, lastTikTokSend, listVideos } from "@regie/db";
import { providers } from "@regie/server";
import { Gauge } from "lucide-react";
import Link from "next/link";
import { CopyCaption } from "@/components/caption";
import { DeleteVideo } from "@/components/delete-video";
import { LaunchForm } from "@/components/launch-form";
import { TypedTitle } from "@/components/typed-title";
import { ownerOrLogin } from "@/lib/owner";
import { STEPS } from "@/lib/steps";

export const dynamic = "force-dynamic";

type Row = Awaited<ReturnType<typeof listVideos>>[number];
type Group = "toi" | "cours" | "pretes" | "envoyees";
type Tone = "warn" | "hot" | "run" | "ok";

const GROUPS: [Group, string][] = [
  ["toi", "À toi"],
  ["cours", "En cours"],
  ["pretes", "Prêtes à envoyer"],
  ["envoyees", "Envoyées"],
];

/** Where a video stands, from the list alone: its group, what to say, and its step on the Piste. */
function place(v: Row, send: Awaited<ReturnType<typeof lastTikTokSend>>): { group: Group; label: string; tone: Tone; step: number } {
  const p = v.progress;
  const count = p && p.total > 1 ? ` ${p.done}/${p.total}` : "";
  const fromStep = /image/i.test(p?.step ?? "") ? 2 : /voix|découpage/i.test(p?.step ?? "") ? 1 : /fichier|montage/i.test(p?.step ?? "") ? 4 : 0;
  switch (v.status) {
    case "review":
      return { group: "toi", label: "Script à relire", tone: "warn", step: 0 };
    case "listen":
      return { group: "toi", label: "Voix à écouter", tone: "warn", step: 1 };
    case "error":
      return { group: "toi", label: "Bloquée · à reprendre", tone: "hot", step: fromStep };
    case "rendering":
      return { group: "cours", label: `Fabrication du MP4${count}`, tone: "run", step: 4 };
    case "draft":
    case "generating":
      return { group: "cours", label: `${p?.step ?? "En préparation"}${count}`, tone: "run", step: fromStep };
    case "ready": {
      if (!v.renderAsset) return { group: "toi", label: "Aperçu à vérifier", tone: "warn", step: 3 };
      const current = send && send.renderAsset === v.renderAsset ? send : null;
      if (current?.status === "inbox") return { group: "envoyees", label: "Dans ta boîte TikTok", tone: "ok", step: 6 };
      if (current && (current.status === "sending" || current.status === "processing")) return { group: "cours", label: "Envoi sur TikTok", tone: "run", step: 5 };
      return { group: "pretes", label: current?.status === "error" ? "Envoi échoué · à renvoyer" : "MP4 prêt à envoyer", tone: current?.status === "error" ? "hot" : "ok", step: 5 };
    }
  }
}

/** Mobile-first: one question, three fields, and the videos sorted by what they wait for. */
export default async function Home() {
  await ownerOrLogin();
  const db = getDb();
  const videos = await listVideos(db);
  const sends = await Promise.all(videos.map((v) => lastTikTokSend(db, v.id)));
  const rows = videos.map((v, i) => ({ v, ...place(v, sends[i]) }));
  const p = providers();
  const demo = [!p.claude && "Claude", !p.voice && "voix", !p.images && "images"].filter(Boolean) as string[];
  let k = 0;
  return (
    <main className="home">
      <header className="home-top">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="logo-in" src="/logo.svg" alt="Thomas" width={40} height={40} />
        <span style={{ marginLeft: "auto", display: "flex", gap: 4, alignItems: "center" }}>
          <Link href="/conso" className="btn ghost sm">
            <Gauge size={15} /> Conso
          </Link>
          <form action="/auth/logout" method="post">
            <button className="btn ghost sm" type="submit">
              Déconnexion
            </button>
          </form>
        </span>
      </header>
      <section className="launch">
        <TypedTitle first="Quelle" second="chanson ?" />
        {demo.length > 0 && (
          <p className="chip warn" style={{ alignSelf: "flex-start", whiteSpace: "normal" }}>
            <span className="dot" />
            Mode démo pour : {demo.join(", ")}. Ajoute les clés sur le serveur pour la vraie version.
          </p>
        )}
        <LaunchForm />
        <p className="mute" style={{ margin: 0, fontSize: 14 }}>
          Tu peux en lancer plusieurs à la suite : elles avancent seules et passent dans « À toi » quand elles ont besoin de toi.
        </p>
      </section>
      <section className="queue" aria-label="Tes vidéos">
        {rows.length === 0 && <p className="mute">Tes vidéos apparaîtront ici.</p>}
        {GROUPS.map(([g, title]) => {
          const list = rows.filter((r) => r.group === g);
          if (!list.length) return null;
          return (
            <div key={g} className="qgrp">
              <h2 className="eyebrow">
                {title} {g === "toi" && <b>{list.length}</b>}
              </h2>
              {list.map(({ v, label, tone, step }) => (
                <div key={v.id} className="vrow qrow" style={{ "--i": Math.min(k++, 8) } as React.CSSProperties}>
                  <Link href={`/v/${v.id}`}>
                    <span className="t">
                      {v.title} <span>· {v.artist}</span>
                    </span>
                    <span className="mp" aria-hidden>
                      {STEPS.map((s, i) => (
                        <i key={s.title} className={i < step ? "d" : i === step ? (tone === "run" ? "r" : "y") : ""} />
                      ))}
                    </span>
                    <span className={`chip ${tone === "run" ? "run" : tone}`}>
                      <span className="dot" />
                      {label}
                    </span>
                  </Link>
                  {v.caption && g !== "cours" && g !== "toi" && <CopyCaption text={v.caption} label="Légende" />}
                  <DeleteVideo id={v.id} short />
                </div>
              ))}
            </div>
          );
        })}
      </section>
    </main>
  );
}
