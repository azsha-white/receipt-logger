// Read the claims inside a Google id token for DISPLAY ONLY (who is signed in, when it expires).
// The page never trusts these; the Apps Script verifies every token with Google.

export type IdTokenClaims = { email?: string; name?: string; exp?: number; aud?: string };

export function decodeJwtPayload(jwt: string): IdTokenClaims | null {
  const parts = jwt.split('.');
  if (parts.length !== 3) return null;
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    const bytes = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
    const claims: unknown = JSON.parse(new TextDecoder().decode(bytes));
    return claims && typeof claims === 'object' ? (claims as IdTokenClaims) : null;
  } catch {
    return null;
  }
}
