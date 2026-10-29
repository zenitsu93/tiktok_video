import { getDb, getVideo } from "@regie/db";
import { notFound } from "next/navigation";
import { Fil } from "@/components/fil";
import { ownerOrLogin } from "@/lib/owner";
import { videoView } from "@/lib/view";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function VideoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await ownerOrLogin(`/v/${id}`);
  if (!UUID.test(id)) notFound();
  const row = await getVideo(getDb(), id);
  if (!row) notFound();
  return <Fil initial={await videoView(row)} />;
}
