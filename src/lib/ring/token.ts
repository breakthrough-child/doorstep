// Read the (unverified) issue time from a Ring access token. Playground tokens are JWTs whose
// `iat` is also where the API's authorized data window begins (FRICTION F-09). Non-JWT tokens → null.
export function tokenIssuedAtMs(token: string): number | null {
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    const json = JSON.parse(Buffer.from(part.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")) as {
      iat?: unknown;
    };
    return typeof json.iat === "number" ? json.iat * 1000 : null;
  } catch {
    return null;
  }
}
