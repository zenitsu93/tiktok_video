import { redirect } from "next/navigation";
import { requireOwner } from "./http";

/** For pages: back to the login screen instead of an error. */
export async function ownerOrLogin(next = "/"): Promise<string> {
  try {
    return await requireOwner();
  } catch {
    redirect(`/login${next !== "/" ? `?next=${encodeURIComponent(next)}` : ""}`);
  }
}
