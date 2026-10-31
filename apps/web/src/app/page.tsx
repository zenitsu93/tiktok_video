import { expireTikTokSends, getDb, lastTikTokSend, listVideos } from "@regie/db";
import { providers } from "@regie/server";
import { Gauge } from "lucide-react";
import Link from "next/link";
import { CopyCaption } from "@/components/caption";
import { DeleteVideo } from "@/components/delete-video";
import { LaunchForm } from "@/components/launch-form";
import { AskPublished, PublishedBox } from "@/components/published";
import { TypedTitle } from "@/components/typed-title";
import { ownerOrLogin } from "@/lib/owner";
import { STEPS } from "@/lib/steps";

export const dynamic = "force-dynamic";

type Row = Awaited<ReturnType<typeof listVideos>>[number];
type Group = "toi" | "cours" | "apublier" | "publiees";
type Tone = "warn" | "hot" | "run" | "ok";

const GROUPS: [Group, string][] = [
  ["toi", "À toi"],
  ["cours", "En cours"],
  ["apublier", "À publier"],
  ["publiees", "Publiées"],
];

const day = (d: Date) => new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" }).format(d);

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
      if (v.publishedAt) return { group: "publiees", label: `Publiée · ${day(v.publishedAt)}`, tone: "ok", step: 6 };
      const current = send && send.renderAsset === v.renderAsset ? send : null;
      if (current && (current.status === "sending" || current.status === "processing")) return { group: "cours", label: "Envoi sur TikTok", tone: "run", step: 5 };
      if (current?.status === "unconfirmed") return { group: "apublier", label: "Envoyée · TikTok n'a pas confirmé", tone: "warn", step: 5 };
      if (current?.status === "inbox") return { group: "apublier", label: `Dans ta boîte TikTok · ${day(current.createdAt)}`, tone: "warn", step: 5 };
      if (current?.status === "error") return { group: "apublier", label: "Envoi échoué · à renvoyer", tone: "hot", step: 5 };
      if (v.downloadedAt) return { group: "apublier", label: `Téléchargée · ${day(v.downloadedAt)}`, tone: "warn", step: 5 };
      return { group: "apublier", label: "MP4 prêt", tone: "ok", step: 5 };
    }
  }
}

/** A video that left the Régie a while ago (sent or downloaded) and was never ticked: worth asking. */
function leftAgo(v: Row, send: Awaited<ReturnType<typeof lastTikTokSend>>): string | null {
  const ago = (d: Date) => Date.now() - d.getTime() > 6 * 3600_000;
  if (send?.status === "inbox" && send.renderAsset === v.renderAsset && ago(send.createdAt)) return `envoyée le ${day(send.createdAt)}`;
  if (v.downloadedAt && ago(v.downloadedAt)) return `téléchargée le ${day(v.downloadedAt)}`;
  return null;
}

/** Mobile-first: one question, three fields, and the videos sorted by what they wait for. */
export default async function Home() {
  await ownerOrLogin();
  const db = getDb();
  await expireTikTokSends(db);
  const videos = await listVideos(db);
  const sends = await Promise.all(videos.map((v) => lastTikTokSend(db, v.id)));
  const rows = videos.map((v, i) => ({ v, ...place(v, sends[i]), ask: leftAgo(v, sends[i]) }));
  const ask = rows.find((r) => r.group === "apublier" && r.ask);
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
        {ask && <AskPublished id={ask.v.id} title={ask.v.title} how={ask.ask!} />}
        {GROUPS.map(([g, title]) => {
          const list = rows.filter((r) => r.group === g);
          if (!list.length) return null;
          const items = list.map(({ v, label, tone, step }) => (
            <div key={v.id} className={`vrow qrow${g === "publiees" ? " pub" : ""}`} style={{ "--i": Math.min(k++, 8) } as React.CSSProperties}>
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
              {v.caption && g === "apublier" && <CopyCaption text={v.caption} label="Légende" />}
              {(g === "apublier" || g === "publiees") && <PublishedBox id={v.id} on={g === "publiees"} />}
              {g !== "publiees" && <DeleteVideo id={v.id} short />}
            </div>
          ));
          // what is out stays out of the way: folded at the bottom, one tap to open
          return g === "publiees" ? (
            <details key={g} className="qgrp fold">
              <summary className="eyebrow">
                {title} · {list.length}
              </summary>
              {items}
            </details>
          ) : (
            <div key={g} className="qgrp">
              <h2 className="eyebrow">
                {title} {(g === "toi" || g === "apublier") && <b>{list.length}</b>}
              </h2>
              {items}
            </div>
          );
        })}
      </section>
    </main>
  );
}
