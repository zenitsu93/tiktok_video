import { getDb, listVideos } from "@regie/db";
import { providers } from "@regie/server";
import { Gauge } from "lucide-react";
import Link from "next/link";
import { CopyCaption } from "@/components/caption";
import { DeleteVideo } from "@/components/delete-video";
import { LaunchForm } from "@/components/launch-form";
import { StatusChip } from "@/components/status";
import { TypedTitle } from "@/components/typed-title";
import { ownerOrLogin } from "@/lib/owner";

export const dynamic = "force-dynamic";

/** Mobile-first: one question, three fields, and the videos already made. */
export default async function Home() {
  await ownerOrLogin();
  const [videos, p] = [await listVideos(getDb()), providers()];
  const demo = [!p.claude && "Claude", !p.voice && "voix", !p.images && "images"].filter(Boolean) as string[];
  return (
    <main className="launch">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="logo-in" src="/logo.svg" alt="Thomas" width={44} height={44} />
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <Link href="/conso" className="btn ghost sm">
            <Gauge size={15} /> Conso
          </Link>
          <form action="/auth/logout" method="post">
            <button className="btn ghost sm" type="submit">
              Déconnexion
            </button>
          </form>
        </div>
      </div>
      <TypedTitle first="Quelle" second="chanson ?" />
      {demo.length > 0 && (
        <p className="chip warn" style={{ alignSelf: "flex-start", whiteSpace: "normal" }}>
          <span className="dot" />
          Mode démo pour : {demo.join(", ")}. Ajoute les clés sur le serveur pour la vraie version.
        </p>
      )}
      <LaunchForm />
      {videos.length > 0 && (
        <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span className="eyebrow">Tes vidéos</span>
          <nav className="vlist">
            {videos.map((v, i) => (
              <div key={v.id} className="vrow" style={{ "--i": Math.min(i, 8) } as React.CSSProperties}>
                <Link href={`/v/${v.id}`}>
                  <span className="t">
                    {v.title} <span>· {v.artist}</span>
                  </span>
                  <StatusChip status={v.status} />
                  <span className="mute" style={{ fontSize: 13 }}>
                    {new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(v.updatedAt)}
                  </span>
                </Link>
                {v.caption && <CopyCaption text={v.caption} label="Légende" />}
                <DeleteVideo id={v.id} short />
              </div>
            ))}
          </nav>
        </section>
      )}
    </main>
  );
}
