// Release version and the "Update available" check.
//
// The version number is package.json's "version" (semver), baked into the page at build time and also written
// to version.json next to the page. A deploy of a new release changes version.json on the server while an open
// page (or an installed home-screen copy) still runs the old code. The page therefore re-reads version.json when it
// opens, whenever it comes back to the foreground, and every 15 minutes; any difference shows the Update button.
// Clicking it reloads, which fetches the new page.

export type VersionInfo = { version: string; build: string; built_at?: string };

export type UpdateVerdict =
  | { kind: 'same' }
  | { kind: 'update'; remote: VersionInfo; label: string };

/** "1.2.3" -> [1, 2, 3]; null for anything that is not three dot-separated numbers. */
export function parseSemver(v: string): [number, number, number] | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(v.trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** -1 if a < b, 0 if equal, 1 if a > b. Unparseable versions compare equal to each other and lower than parseable ones. */
export function compareVersions(a: string, b: string): -1 | 0 | 1 {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  if (!pa && !pb) return 0;
  if (!pa) return -1;
  if (!pb) return 1;
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1;
  }
  return 0;
}

/** The server's version.json, or null when the text is not that file (a 404 page, an HTML error, junk). */
export function parseVersionFile(text: string): VersionInfo | null {
  try {
    const body = JSON.parse(text) as { version?: unknown; build?: unknown; built_at?: unknown };
    if (typeof body?.version !== 'string' || typeof body?.build !== 'string') return null;
    return { version: body.version, build: body.build, built_at: typeof body.built_at === 'string' ? body.built_at : undefined };
  } catch {
    return null;
  }
}

/**
 * Decide whether what the server has differs from what this page is running.
 * A newer version is an update. A different build of the same version (a deploy without a version bump) is also an
 * update, because every change must reach the household. An older version (a rollback) is offered too.
 */
export function judgeUpdate(current: VersionInfo, remote: VersionInfo): UpdateVerdict {
  if (remote.version === current.version && remote.build === current.build) return { kind: 'same' };
  const cmp = compareVersions(remote.version, current.version);
  const label = cmp === 0
    ? `Update available · v${remote.version} (new build ${remote.build})`
    : `Update available · v${remote.version}`;
  return { kind: 'update', remote, label };
}

/** sessionStorage key kept across the reload so the page can tell "updated" from "still rolling out". */
export const PENDING_KEY = 'receipt-logger.pending-update';

export function versionKey(v: VersionInfo): string {
  return `${v.version}+${v.build}`;
}

export type WatchOptions = {
  url: string;
  current: VersionInfo;
  onUpdate: (verdict: Extract<UpdateVerdict, { kind: 'update' }>) => void;
  intervalMs?: number;
  fetchImpl?: typeof fetch;
};

/** Start polling version.json. Returns a function that checks right now (used by the tests and the button). */
export function startUpdateWatch(opts: WatchOptions): () => Promise<UpdateVerdict | null> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const intervalMs = opts.intervalMs ?? 15 * 60 * 1000;

  const check = async (): Promise<UpdateVerdict | null> => {
    try {
      const res = await fetchImpl(`${opts.url}?t=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) return null;
      const remote = parseVersionFile(await res.text());
      if (!remote) return null;
      const verdict = judgeUpdate(opts.current, remote);
      if (verdict.kind === 'update') opts.onUpdate(verdict);
      return verdict;
    } catch {
      return null; // offline or blocked: say nothing, try again later
    }
  };

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void check(); });
  }
  const timer = setTimeout(() => void check(), 1500);
  const interval = setInterval(() => void check(), intervalMs);
  // Node (the tests) would otherwise keep the process alive on these timers.
  (timer as unknown as { unref?: () => void }).unref?.();
  (interval as unknown as { unref?: () => void }).unref?.();
  return check;
}
