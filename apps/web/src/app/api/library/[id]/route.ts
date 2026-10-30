import { getDb, removeFromLibrary } from "@regie/db";
import { storage } from "@regie/server";
import { NextResponse } from "next/server";
import { HttpError, route } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

/** Takes a picture out of the library; its files go when no video uses them. */
export const DELETE = route(async (_req, { params }: Ctx) => {
  const id = (await params).id;
  if (!/^[\w.-]{1,80}$/.test(id)) throw new HttpError(404, "Image introuvable.");
  const keys = await removeFromLibrary(getDb(), id);
  // the row is already gone: a file that fails to go is only wasted space
  await Promise.all(keys.map((k) => storage().remove(k).catch(() => undefined)));
  return NextResponse.json({ ok: true });
});
