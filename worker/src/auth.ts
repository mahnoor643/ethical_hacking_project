
// Access control: one shared access code (a Worker secret) exchanged for
// an HMAC-signed, HttpOnly session cookie.
//
// - ACCESS_CODE and SESSION_SECRET are Worker secrets. They are never sent
//   to the browser and never stored in the repository.
// - If either secret is missing, authentication FAILS CLOSED: nobody can log
//   in and every protected endpoint returns 503.
// - The cookie is HttpOnly (no JavaScript access), Secure, SameSite=Strict
//   (no cross-site sending) and scoped to /api.

export interface AuthEnv {
  ACCESS_CODE?: string;
  SESSION_SECRET?: string;
}

export const SESSION_COOKIE = "aal_session";
export const SESSION_TTL_SECONDS = 8 * 60 * 60;

const MIN_ACCESS_CODE_LENGTH = 10;
const MIN_SESSION_SECRET_LENGTH = 32;

const encoder = new TextEncoder();

export function isAuthConfigured(env: AuthEnv): boolean {
  return (
    typeof env.ACCESS_CODE === "string" &&
    env.ACCESS_CODE.length >= MIN_ACCESS_CODE_LENGTH &&
    typeof env.SESSION_SECRET === "string" &&
    env.SESSION_SECRET.length >= MIN_SESSION_SECRET_LENGTH
  );
}

function b64url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(text: string): Uint8Array | null {
  try {
    const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(binary, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

async function hmac(secret: string, data: string): Promise<Uint8Array> {
  const key = await hmacKey(secret);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(data)));
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

// Compares the submitted code with ACCESS_CODE without leaking timing:
// both are HMAC'd first, so the compared values always have equal length.
export async function checkAccessCode(env: AuthEnv, submitted: string): Promise<boolean> {
  if (!isAuthConfigured(env)) return false;
  const secret = env.SESSION_SECRET!;
  const [a, b] = await Promise.all([
    hmac(secret, `code:${submitted}`),
    hmac(secret, `code:${env.ACCESS_CODE}`)
  ]);
  return constantTimeEqual(a, b);
}

export async function createSessionToken(
  env: AuthEnv,
  nowMs: number = Date.now()
): Promise<{ token: string; expiresAt: number }> {
  const expiresAt = Math.floor(nowMs / 1000) + SESSION_TTL_SECONDS;
  const payload = b64url(encoder.encode(JSON.stringify({ exp: expiresAt })));
  const signature = b64url(await hmac(env.SESSION_SECRET!, `session:${payload}`));
  return { token: `${payload}.${signature}`, expiresAt };
}

// Returns the expiry (unix seconds) of a valid session, or null.
export async function verifySessionToken(
  env: AuthEnv,
  token: string | null,
  nowMs: number = Date.now()
): Promise<number | null> {
  if (!token || !isAuthConfigured(env)) return null;
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra !== undefined) return null;

  const sigBytes = fromB64url(signature);
  if (!sigBytes) return null;

  const key = await hmacKey(env.SESSION_SECRET!);
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    sigBytes,
    encoder.encode(`session:${payload}`)
  );
  if (!valid) return null;

  try {
    const bytes = fromB64url(payload);
    const data = bytes ? JSON.parse(new TextDecoder().decode(bytes)) : null;
    const exp = data && typeof data.exp === "number" ? data.exp : 0;
    return exp > Math.floor(nowMs / 1000) ? exp : null;
  } catch {
    return null;
  }
}

export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("Cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return rest.join("=");
  }
  return null;
}

export function sessionCookie(token: string, maxAge: number): string {
  return `${SESSION_COOKIE}=${token}; Path=/api; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}

export function clearedSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/api; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

export async function getSession(env: AuthEnv, request: Request): Promise<number | null> {
  return verifySessionToken(env, readCookie(request, SESSION_COOKIE));
}
