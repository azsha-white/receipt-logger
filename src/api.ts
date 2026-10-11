// Page -> Apps Script transport (DATA.md section 4).
// POST with Content-Type text/plain so the browser sends no CORS preflight (Apps Script cannot answer one),
// and follow Google's redirect to the googleusercontent.com result URL.

export type ApiError = { code: string; message: string };
export type ApiResult<T = unknown> = { ok: true; data: T } | { ok: false; error: ApiError };
export type ApiCall<T = unknown> = { result: ApiResult<T>; ms: number; status: number | null };

/** Client-side codes, for failures that never reached the script's JSON (not in DATA.md's server list). */
export const CLIENT_ERRORS = {
  NETWORK: 'NETWORK',
  NOT_JSON: 'NOT_JSON',
  BAD_ENVELOPE: 'BAD_ENVELOPE',
} as const;

export type ConfigState =
  | { configured: true }
  | { configured: false; missing: string[] };

/** True only when both public values have been replaced with real-looking ones. */
export function checkConfig(clientId: string, scriptUrl: string): ConfigState {
  const missing: string[] = [];
  if (!/^[\w-]+\.apps\.googleusercontent\.com$/.test(clientId.trim())) missing.push('Google sign-in client id');
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(scriptUrl.trim())) missing.push('Apps Script web app URL');
  return missing.length ? { configured: false, missing } : { configured: true };
}

/** The request body: the DATA.md envelope as a JSON string. */
export function buildEnvelope(idToken: string, action: string, payload: Record<string, unknown> = {}): string {
  return JSON.stringify({ id_token: idToken, action, payload });
}

/** Turn a response body into an ApiResult, never throwing. A script crash comes back as an HTML page. */
export function parseApiResponse<T = unknown>(text: string): ApiResult<T> {
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    const snippet = text.replace(/\s+/g, ' ').trim().slice(0, 160);
    return { ok: false, error: { code: CLIENT_ERRORS.NOT_JSON, message: `The script answered with something that is not JSON: "${snippet}"` } };
  }
  if (body && typeof body === 'object' && 'ok' in body) {
    const b = body as { ok: unknown; data?: unknown; error?: unknown };
    if (b.ok === true) return { ok: true, data: (b.data ?? {}) as T };
    if (b.ok === false && b.error && typeof b.error === 'object') {
      const e = b.error as { code?: unknown; message?: unknown };
      if (typeof e.code === 'string') {
        return { ok: false, error: { code: e.code, message: typeof e.message === 'string' ? e.message : '' } };
      }
    }
  }
  return { ok: false, error: { code: CLIENT_ERRORS.BAD_ENVELOPE, message: 'The reply is JSON but not in the expected { ok, data | error } shape.' } };
}

export async function callApi<T = unknown>(
  scriptUrl: string,
  idToken: string,
  action: string,
  payload: Record<string, unknown> = {},
): Promise<ApiCall<T>> {
  const started = performance.now();
  try {
    const res = await fetch(scriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: buildEnvelope(idToken, action, payload),
      redirect: 'follow',
    });
    const text = await res.text();
    return { result: parseApiResponse<T>(text), ms: Math.round(performance.now() - started), status: res.status };
  } catch (err) {
    // A CORS block and a dead network look identical from inside the page: fetch rejects with a TypeError.
    const message = err instanceof Error ? err.message : String(err);
    return {
      result: { ok: false, error: { code: CLIENT_ERRORS.NETWORK, message: `The request did not complete (${message}). If the network is fine, the browser blocked the cross-origin reply.` } },
      ms: Math.round(performance.now() - started),
      status: null,
    };
  }
}
