import { EditError } from "@regie/core";
import { BudgetError, env } from "@regie/server";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import { readSession, SESSION_COOKIE } from "./session";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BEAT = /^b\d{2,3}$/;

export function videoId(id: string): string {
  if (!UUID.test(id)) throw new HttpError(404, "Vidéo introuvable.");
  return id;
}

export function beatId(id: string): string {
  if (!BEAT.test(id)) throw new HttpError(404, "Plan introuvable.");
  return id;
}

/** The page or handler runs only for the owner. The proxy checks first; this is the second lock. */
export async function requireOwner(): Promise<string> {
  const login = await readSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!login) throw new HttpError(401, "Connexion requise.");
  return login;
}

/**
 * Wraps a route handler: owner only, same-origin for anything that changes data,
 * JSON body size capped, and errors turned into short French messages.
 */
export function route<C>(fn: (req: NextRequest, ctx: C) => Promise<Response>) {
  return async (req: NextRequest, ctx: C): Promise<Response> => {
    try {
      await requireOwner();
      if (req.method !== "GET" && req.method !== "HEAD") checkOrigin(req);
      return await fn(req, ctx);
    } catch (e) {
      return errorResponse(e);
    }
  };
}

function checkOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  const allowed = new Set([new URL(env().APP_URL).origin, req.nextUrl.origin]);
  if (!origin || !allowed.has(origin)) throw new HttpError(403, "Origine refusée.");
  if (req.headers.get("sec-fetch-site") && req.headers.get("sec-fetch-site") !== "same-origin") throw new HttpError(403, "Origine refusée.");
}

export async function body(req: NextRequest, max = 8_000): Promise<unknown> {
  const text = await req.text();
  if (text.length > max) throw new HttpError(413, "Requête trop grosse.");
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, "JSON invalide.");
  }
}

export function errorResponse(e: unknown): Response {
  if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
  if (e instanceof EditError) return NextResponse.json({ error: e.message }, { status: 422 });
  if (e instanceof BudgetError) return NextResponse.json({ error: e.message }, { status: 402 });
  if (e instanceof ZodError) return NextResponse.json({ error: "Données invalides.", issues: e.issues.map((i) => i.path.join(".") + " : " + i.message) }, { status: 400 });
  console.error("[api]", e);
  return NextResponse.json({ error: "Erreur interne." }, { status: 500 });
}
