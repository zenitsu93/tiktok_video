"use client";

import { libraryForIdea, searchLibrary } from "@regie/core";
import { Library, Play, Search, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { LibraryItem } from "@/lib/library";
import type { VideoView } from "@/lib/view";
import type { Notify } from "./pronunciations";

// one load for the whole page: every tile of La Planche reads it (the library only grows at an export)
let shared: Promise<LibraryItem[]> | null = null;

function load(): Promise<LibraryItem[]> {
  shared ??= fetch("/api/library")
    .then((r) => (r.ok ? r.json() : { items: [] }))
    .then((d: { items: LibraryItem[] }) => d.items)
    .catch(() => {
      shared = null;
      return [];
    });
  return shared;
}

/** The library, loaded once and shared by everything on the page. */
export function useLibrary(): LibraryItem[] | null {
  const [items, setItems] = useState<LibraryItem[] | null>(null);
  useEffect(() => {
    let live = true;
    void load().then((i) => live && setItems(i));
    return () => {
      live = false;
    };
  }, []);
  return items;
}

/** The library pictures that fit an idea and are not on this video yet. */
export function ideaSuggestions(items: LibraryItem[] | null, v: VideoView, queries: string[], n = 4): LibraryItem[] {
  if (!items?.length || !queries.length) return [];
  return libraryForIdea(
    items.filter((i) => !v.images[i.assetId]),
    queries,
    n,
    true,
  );
}

/**
 * The one library picture the Régie would take for an idea by itself (the same rule as before a
 * Pinterest search: two shared words), or null when none fits. `taken`: pictures already given.
 */
export function bestFromShelf(items: LibraryItem[] | null, v: VideoView, queries: string[], taken: Set<string> = new Set()): LibraryItem | null {
  if (!items?.length || !queries.length) return null;
  return libraryForIdea(
    items.filter((i) => !v.images[i.assetId] && !taken.has(i.assetId)),
    queries,
    1,
  )[0] ?? null;
}

/** Puts a library picture on the lines of one idea. Free: nothing is searched. `quiet`: no message, no refresh (a batch says it once). */
export async function putFromShelf(v: VideoView, beatIds: string[], item: LibraryItem, notify: Notify, quiet = false): Promise<boolean> {
  const [first, ...also] = beatIds;
  try {
    const r = await fetch(`/api/videos/${v.id}/beats/${first}/library`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ asset: item.assetId, also }),
    });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `Erreur ${r.status}`);
    if (!quiet) {
      notify.flash(`« ${item.label} » vient de ta bibliothèque`);
      notify.onChange();
    }
    return true;
  } catch (e) {
    notify.flash(e instanceof Error ? e.message : "Impossible", true);
    return false;
  }
}

export function ShelfThumb({ item, onPick, small }: { item: LibraryItem; onPick: () => void; small?: boolean }) {
  return (
    <button
      type="button"
      className={`shelf-thumb${item.cut ? " cut" : ""}${small ? " sm" : ""}`}
      onClick={(e) => {
        e.stopPropagation();
        onPick();
      }}
      title={`${item.label} · ${item.text}`}
      aria-label={`Prendre « ${item.label} » de ta bibliothèque`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={item.url} alt="" loading="lazy" />
      {item.clip && (
        <span className="clipmark" aria-hidden="true">
          <Play size={10} />
        </span>
      )}
      {!small && <span className="shelf-label">{item.label}</span>}
      {!small && item.uses > 1 && <span className="shelf-uses mono">×{item.uses}</span>}
    </button>
  );
}

/**
 * « Bibliothèque » : the pictures kept on earlier videos. Empty field: the ones that fit this idea
 * (or the latest); type « micro » and the grid follows as you type. A click puts it on `beatIds`.
 */
export function ShelfSearch({
  v,
  beatIds,
  queries,
  notify,
  onClose,
  target,
}: {
  v: VideoView;
  beatIds: string[];
  queries: string[];
  notify: Notify;
  onClose?: () => void;
  /** Says where a click goes, when it is not obvious (La Planche: the lit tile). */
  target?: string;
}) {
  const items = useLibrary();
  const [q, setQ] = useState("");
  const pool = (items ?? []).filter((i) => !v.images[i.assetId]);
  const fit = ideaSuggestions(items, v, queries, 12);
  const typed = q.trim();
  const shown = typed ? searchLibrary(pool, typed, 40) : fit.length ? fit : pool.slice(0, 12);
  const head = typed
    ? `${shown.length} image${shown.length > 1 ? "s" : ""} · ${typed}`
    : fit.length
      ? `${fit.length} pour cette idée`
      : pool.length
        ? "Les dernières gardées"
        : "";

  return (
    <div className="shelf" role="search" onClick={(e) => e.stopPropagation()}>
      <div className="shelf-q">
        <Search size={15} aria-hidden="true" />
        <input
          id={`shelf-${beatIds[0] ?? "x"}`}
          value={q}
          autoFocus
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") onClose?.();
            if (e.key === "Enter" && shown[0] && beatIds.length) void putFromShelf(v, beatIds, shown[0], notify);
          }}
          placeholder="Chercher dans ta bibliothèque : micro, platine, foule…"
          aria-label="Chercher dans ta bibliothèque"
        />
        {onClose && (
          <button type="button" className="btn ghost sm" onClick={onClose} aria-label="Fermer la bibliothèque">
            <X size={14} />
          </button>
        )}
      </div>
      {items === null ? (
        <p className="mute shelf-note">Ouverture de ta bibliothèque…</p>
      ) : !items.length ? (
        <p className="mute shelf-note">
          <Library size={14} /> Ta bibliothèque est vide pour l&apos;instant. Les images que tu gardes sur tes plans y entrent quand tu montes la vidéo.
        </p>
      ) : !shown.length ? (
        <p className="mute shelf-note">Rien pour « {typed} ». Essaie un autre mot, en français ou en anglais.</p>
      ) : (
        <>
          <span className="lab">
            {head}
            {target ? ` · un clic la pose sur ${target}` : ""}
          </span>
          <div className="shelf-grid">
            {shown.map((i) => (
              <ShelfThumb key={i.assetId} item={i} onPick={() => beatIds.length && void putFromShelf(v, beatIds, i, notify)} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
