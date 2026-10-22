// Read the (unverified) issue time from a Ring access token. Playground tokens are JWTs whose
// `iat` is also where the API's authorized data window begins (FRICTION F-09). Non-JWT tokens → null.
function claims(token: string): { iat?: unknown; exp?: unknown } | null {
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    return JSON.parse(Buffer.from(part.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
  } catch {
    return null;
  }
}

export function tokenIssuedAtMs(token: string): number | null {
  const c = claims(token);
  return typeof c?.iat === "number" ? c.iat * 1000 : null;
}

/** Expiry from the JWT `exp` claim (Playground tokens: issue time + 30 min). Null if unknown. */
export function tokenExpiresAtMs(token: string): number | null {
  const c = claims(token);
  return typeof c?.exp === "number" ? c.exp * 1000 : null;
}
