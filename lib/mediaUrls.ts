/**
 * One object URL per File, plus cleanup. Object URLs keep their blob in memory until revoked, so
 * anything that is no longer reachable (not in the slides, undo history, saved copy...) is revoked.
 */
const urls = new Map<File, { url: string; created: number }>();

/** Files younger than this are never revoked (protects files that are about to be inserted). */
const GRACE_MS = 15_000;

export function urlFor(file: File): string {
  let entry = urls.get(file);
  if (!entry) {
    entry = { url: URL.createObjectURL(file), created: Date.now() };
    urls.set(file, entry);
  }
  return entry.url;
}

/** Revoke every URL whose File is not in `keep`. */
export function pruneUrls(keep: Set<File>): void {
  const now = Date.now();
  for (const [file, entry] of urls) {
    if (keep.has(file) || now - entry.created < GRACE_MS) continue;
    URL.revokeObjectURL(entry.url);
    urls.delete(file);
  }
}
