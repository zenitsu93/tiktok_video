import { getDb, listLibrary } from "@regie/db";
import { NextResponse } from "next/server";
import { route } from "@/lib/http";
import { libraryItem } from "@/lib/library";

/** The whole library, the most recently used first. A few hundred pictures: the page searches it itself, as you type. */
export const GET = route(async () => {
  const rows = await listLibrary(getDb());
  return NextResponse.json({ items: rows.map(libraryItem) });
});
