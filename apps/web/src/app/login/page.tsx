import { env } from "@regie/server";
import { github, safeNext } from "@/lib/github";

const ERRORS: Record<string, string> = {
  owner: "Ce compte GitHub n'a pas accès à la Régie.",
  state: "La connexion a expiré, recommence.",
  github: "GitHub n'a pas répondu, recommence.",
  config: "La connexion GitHub n'est pas configurée (GITHUB_CLIENT_ID et GITHUB_CLIENT_SECRET).",
};

export const metadata = { title: "Connexion" };

export default async function Login({ searchParams }: { searchParams: Promise<{ e?: string; next?: string }> }) {
  const { e, next } = await searchParams;
  const cfg = env();
  const dev = cfg.DEV_LOGIN === "1" && cfg.NODE_ENV !== "production";
  // the GitHub button only shows once its keys are set
  const withGithub = Boolean(github());
  return (
    <main className="launch" style={{ minHeight: "100dvh", justifyContent: "center" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo.svg" alt="" width={72} height={72} />
      <h1>
        Régie <span>Thomas</span>
      </h1>
      <p className="mute" style={{ fontSize: 18, margin: 0 }}>
        Une chanson, une histoire, une vidéo. Réservé à @{cfg.OWNER_GITHUB_LOGIN}.
      </p>
      {e && ERRORS[e] && (
        <p className="chip hot" role="alert" style={{ alignSelf: "flex-start" }}>
          {ERRORS[e]}
        </p>
      )}
      {withGithub && (
        <a className="btn dark go" href={`/auth/github?next=${encodeURIComponent(safeNext(next))}`}>
          Se connecter avec GitHub
        </a>
      )}
      {dev && (
        <form action="/auth/dev" method="post">
          <button className={withGithub ? "btn" : "btn dark go"} type="submit" style={{ width: "100%", justifyContent: "center" }}>
            Entrer en local (DEV_LOGIN)
          </button>
        </form>
      )}
      {!withGithub && !dev && (
        <p className="mute" style={{ margin: 0 }}>
          Aucune connexion n'est configurée : mets DEV_LOGIN=1 dans .env en local, ou GITHUB_CLIENT_ID et GITHUB_CLIENT_SECRET.
        </p>
      )}
    </main>
  );
}
