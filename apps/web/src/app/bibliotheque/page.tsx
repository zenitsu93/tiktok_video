import { getDb, listLibrary } from "@regie/db";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Shelf } from "@/components/shelf";
import { libraryItem } from "@/lib/library";
import { ownerOrLogin } from "@/lib/owner";

export const dynamic = "force-dynamic";

/** « Bibliothèque » : every picture kept on a video, to look through, search, and take out. */
export default async function Bibliotheque() {
  await ownerOrLogin("/bibliotheque");
  const items = (await listLibrary(getDb())).map(libraryItem);
  return (
    <main className="conso">
      <header className="fil-head">
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <Link href="/" className="btn ghost sm" aria-label="Retour aux vidéos">
            <ArrowLeft size={16} />
          </Link>
          <h1 className="t">
            Bibliothèque <span>· {items.length} image{items.length > 1 ? "s" : ""}</span>
          </h1>
        </div>
      </header>
      <p className="mute shelf-intro">
        Les images que tu as gardées sur tes plans, et celles que tu as importées. Elles entrent ici quand tu montes une vidéo, restent même si tu la supprimes, et la
        Régie les reprend toute seule avant de payer une recherche Pinterest.
      </p>
      <Shelf initial={items} />
    </main>
  );
}
