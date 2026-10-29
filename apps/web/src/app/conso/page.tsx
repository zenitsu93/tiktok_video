import { getDb, usageByDay, usageByVideo } from "@regie/db";
import { env, providers } from "@regie/server";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { ownerOrLogin } from "@/lib/owner";

export const dynamic = "force-dynamic";

const PERIODS = [7, 14, 30] as const;
const SERVICES = [
  { key: "claude", label: "Claude", color: "var(--c-claude)" },
  { key: "elevenlabs", label: "Voix ElevenLabs", color: "var(--c-voice)" },
  { key: "apify", label: "Images Apify", color: "var(--c-img)" },
] as const;
type Service = (typeof SERVICES)[number]["key"];
type Day = { key: string; date: Date } & Record<Service | "total", number>;

const usd = (n: number) => `${n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $`;
const isService = (p: string): p is Service => SERVICES.some((s) => s.key === p);

/** "Conso": what Claude, ElevenLabs and Apify cost, per day and per video, against the budgets. */
export default async function Conso({ searchParams }: { searchParams: Promise<{ d?: string }> }) {
  await ownerOrLogin("/conso");
  const asked = Number((await searchParams).d);
  const n = PERIODS.find((p) => p === asked) ?? 14;

  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  since.setUTCDate(since.getUTCDate() - (n - 1));
  const db = getDb();
  const [perDay, perVideo] = await Promise.all([usageByDay(db, since), usageByVideo(db, since)]);
  const { BUDGET_DAY_USD: budgetDay, BUDGET_VIDEO_USD: budgetVideo } = env();
  const live = providers();

  const days: Day[] = Array.from({ length: n }, (_, i) => {
    const date = new Date(since);
    date.setUTCDate(since.getUTCDate() + i);
    return { key: date.toISOString().slice(0, 10), date, claude: 0, elevenlabs: 0, apify: 0, total: 0 };
  });
  const byKey = new Map(days.map((d) => [d.key, d]));
  const calls: Record<Service, number> = { claude: 0, elevenlabs: 0, apify: 0 };
  for (const r of perDay) {
    const d = byKey.get(r.day);
    if (!d || !isService(r.provider)) continue;
    d[r.provider] += Number(r.cost);
    d.total += Number(r.cost);
    calls[r.provider] += r.calls;
  }
  const total = days.reduce((s, d) => s + d.total, 0);
  const sum = (k: Service) => days.reduce((s, d) => s + d[k], 0);

  const videos = new Map<string, { id: string | null; title: string; artist: string; last: string } & Record<Service | "total", number>>();
  for (const r of perVideo) {
    const k = r.videoId ?? "deleted";
    const v = videos.get(k) ?? { id: r.videoId, title: r.title ?? "Vidéo supprimée", artist: r.artist ?? "", last: r.last, claude: 0, elevenlabs: 0, apify: 0, total: 0 };
    if (isService(r.provider)) {
      v[r.provider] += Number(r.cost);
      v.total += Number(r.cost);
    }
    if (r.last > v.last) v.last = r.last;
    videos.set(k, v);
  }
  const vlist = [...videos.values()].filter((v) => v.total > 0).sort((a, b) => b.last.localeCompare(a.last));
  const made = vlist.filter((v) => v.id).length;

  return (
    <main className="conso">
      <header className="fil-head">
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <Link href="/" className="btn ghost sm" aria-label="Retour aux vidéos">
            <ArrowLeft size={16} />
          </Link>
          <h1 className="t">
            Conso <span>· {n} jours</span>
          </h1>
          <nav className="seg" aria-label="Période">
            {PERIODS.map((p) => (
              <Link key={p} href={`/conso?d=${p}`} aria-current={p === n ? "page" : undefined}>
                {p} j
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <div className="tiles">
        <div className="tile total">
          <span className="k">Total</span>
          <span className="v">{usd(total)}</span>
          <span className="s">
            {made} vidéo{made > 1 ? "s" : ""}
            {made > 0 && ` · ${usd(total / made)} par vidéo`}
          </span>
          <Spark values={days.map((d) => d.total)} color="currentColor" />
        </div>
        {SERVICES.map((s) => (
          <div className="tile" key={s.key}>
            <span className="k">
              <i className="sw" style={{ background: s.color }} />
              {s.label}
              {!live[s.key === "elevenlabs" ? "voice" : s.key === "apify" ? "images" : "claude"] && <span className="mute">(démo)</span>}
            </span>
            <span className="v">{usd(sum(s.key))}</span>
            <span className="s">
              {calls[s.key]} appel{calls[s.key] > 1 ? "s" : ""} · {total > 0 ? Math.round((sum(s.key) / total) * 100) : 0} %
            </span>
            <Spark values={days.map((d) => d[s.key])} color={s.color} />
          </div>
        ))}
      </div>

      <div className="conso-grid">
        <section className="panel">
          <div className="r" style={{ flexWrap: "wrap", gap: 8 }}>
            <b style={{ fontWeight: 500 }}>Par jour</b>
            <span className="legend">
              {SERVICES.map((s) => (
                <span key={s.key}>
                  <i className="sw" style={{ background: s.color }} />
                  {s.label}
                </span>
              ))}
            </span>
          </div>
          <Bars days={days} budget={budgetDay} />
        </section>

        <section className="panel">
          <b style={{ fontWeight: 500 }}>Par vidéo</b>
          {vlist.length === 0 ? (
            <p className="mute" style={{ margin: 0 }}>
              Aucune dépense sur cette période.
            </p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table className="ctable">
                <thead>
                  <tr>
                    <th>Vidéo</th>
                    <th>Répartition</th>
                    <th className="amt">Coût</th>
                  </tr>
                </thead>
                <tbody>
                  {vlist.map((v) => (
                    <tr key={v.id ?? "deleted"}>
                      <td>
                        {v.id ? (
                          <Link href={`/v/${v.id}`} style={{ fontWeight: 500, textDecoration: "none" }}>
                            {v.title}
                          </Link>
                        ) : (
                          <span className="mute">{v.title}</span>
                        )}
                        {v.artist && <div className="mute" style={{ fontSize: 12 }}>{v.artist}</div>}
                      </td>
                      <td style={{ width: "34%" }}>
                        <div className="split" title={SERVICES.map((s) => `${s.label} ${usd(v[s.key])}`).join(" · ")}>
                          {SERVICES.map((s) => (
                            <i key={s.key} style={{ width: `${(v[s.key] / v.total) * 100}%`, background: s.color }} />
                          ))}
                        </div>
                      </td>
                      <td className="amt num" style={v.total >= budgetVideo * 0.8 ? { color: "var(--warn)" } : undefined}>
                        {usd(v.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <span className="mute" style={{ fontSize: 13 }}>
            Plafond : {usd(budgetDay)} par jour, {usd(budgetVideo)} par vidéo. Les montages ne coûtent rien.
          </span>
        </section>
      </div>
    </main>
  );
}

function Spark({ values, color }: { values: number[]; color: string }) {
  const w = 120;
  const h = 30;
  const max = Math.max(...values, 0.0001);
  const pts = values.map((v, i) => [i * (w / Math.max(1, values.length - 1)), h - 3 - (v / max) * (h - 6)] as const);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const [lx, ly] = pts[pts.length - 1] ?? [0, h];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden className="spark">
      <path d={`${line} L${w} ${h} L0 ${h} Z`} fill={color} opacity={0.12} />
      <path d={line} fill="none" stroke={color} strokeWidth={1.6} vectorEffect="non-scaling-stroke" />
      <circle cx={lx} cy={ly} r={2.4} fill={color} />
    </svg>
  );
}

/** Stacked bars per day, on one scale, with the daily budget as a dashed line. */
function Bars({ days, budget }: { days: Day[]; budget: number }) {
  const W = 640;
  const H = 220;
  const L = 38;
  const B = 24;
  const T = 12;
  const R = 8;
  const ymax = Math.max(budget * 1.1, ...days.map((d) => d.total));
  const step = ymax > 12 ? 5 : ymax > 6 ? 2 : 1;
  const y = (v: number) => T + (H - T - B) * (1 - v / ymax);
  const bw = (W - L - R) / days.length;
  const ticks = Array.from({ length: Math.floor(ymax / step) + 1 }, (_, i) => i * step);
  const fmt = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Dépenses par jour" className="bars">
      {ticks.map((v) => (
        <g key={v}>
          <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--line)" />
          <text x={L - 6} y={y(v) + 4} textAnchor="end">
            {v} $
          </text>
        </g>
      ))}
      {days.map((d, i) => {
        const x = L + i * bw + bw * 0.18;
        const w = bw * 0.64;
        let acc = 0;
        return (
          <g key={d.key}>
            {SERVICES.map((s) => {
              if (!d[s.key]) return null;
              const y1 = y(acc + d[s.key]);
              const y0 = y(acc);
              acc += d[s.key];
              return (
                <rect key={s.key} x={x} y={y1} width={w} height={Math.max(0.5, y0 - y1)} fill={s.color}>
                  <title>{`${fmt.format(d.date)} · ${s.label} ${usd(d[s.key])}`}</title>
                </rect>
              );
            })}
            {(days.length <= 14 || i % 3 === 0) && (
              <text x={x + w / 2} y={H - 7} textAnchor="middle">
                {d.date.getUTCDate()}
              </text>
            )}
          </g>
        );
      })}
      <line x1={L} x2={W - R} y1={y(budget)} y2={y(budget)} stroke="var(--accent)" strokeDasharray="4 4" />
      <text x={W - R} y={y(budget) - 5} textAnchor="end" className="budget">
        budget du jour {budget} $
      </text>
    </svg>
  );
}
