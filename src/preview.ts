/**
 * Browser-facing preview session — a signed, time-boxed cookie that authorizes
 * a single browser to view draft content through a site's `/preview` routes.
 *
 * The server↔CMS draft bearer (`config.cms.previewToken`) NEVER reaches the
 * browser. Instead an editor presents that token ONCE to the enter-preview
 * endpoint (the same handshake Payload/Next.js Draft Mode use with `?secret=`);
 * we verify it and mint this cookie — an HMAC-signed `<expiryMs>.<sig>` value
 * that proves authorization without carrying the secret itself. The cookie is
 * httpOnly and time-boxed: tampering with the expiry breaks the signature, and
 * the embedded expiry is re-checked server-side so a kept-alive cookie still
 * dies on schedule.
 *
 * Crypto uses the Web Crypto API (`crypto.subtle`) so it behaves identically on
 * the Cloudflare Workers runtime and Node ≥18 — no `node:crypto` import, which
 * would not resolve on Workers.
 */
import { config } from './config';

/** Name of the cookie carrying the signed preview session. */
export const PREVIEW_COOKIE_NAME = 'arp_cms_preview';

const textEncoder = new TextEncoder();

function base64url(bytes: ArrayBuffer): string {
  const view = new Uint8Array(bytes);
  let binary = '';
  for (const byte of view) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function hmac(message: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, textEncoder.encode(message));
  return base64url(signature);
}

/** Constant-time string comparison — avoids leaking equality via timing. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/** True when preview is configured (a server↔CMS token exists). */
export function isPreviewConfigured(): boolean {
  return typeof config.cms.previewToken === 'string' && config.cms.previewToken !== '';
}

/**
 * Constant-time check of an editor-presented enter token against the configured
 * server↔CMS secret. This is the only place the raw secret is accepted from a
 * request; on success the caller mints a cookie via {@link createPreviewSession}.
 */
export function previewTokenMatches(provided: string | null | undefined): boolean {
  const expected = config.cms.previewToken;
  if (!expected || typeof provided !== 'string' || provided === '') {
    return false;
  }
  return timingSafeEqual(provided, expected);
}

export interface PreviewSession {
  /** Signed cookie value: `<expiryMs>.<base64url-hmac>`. */
  value: string;
  /** Cookie `Max-Age` in seconds (mirrors the embedded expiry). */
  maxAge: number;
}

/** Mint a fresh, signed, time-boxed preview-session cookie value. */
export async function createPreviewSession(): Promise<PreviewSession> {
  if (!isPreviewConfigured()) {
    throw new Error('Cannot create a preview session: CMS preview token is not configured.');
  }
  const ttl = config.preview.cookieTtl;
  const expiry = Date.now() + ttl * 1000;
  const signature = await hmac(String(expiry), config.cms.previewToken!);
  return { value: `${expiry}.${signature}`, maxAge: ttl };
}

/** Verify a preview-session cookie value: signature valid AND not expired. */
export async function verifyPreviewSession(value: string | null | undefined): Promise<boolean> {
  if (typeof value !== 'string' || value === '' || !isPreviewConfigured()) {
    return false;
  }
  const separator = value.lastIndexOf('.');
  if (separator <= 0) {
    return false;
  }
  const expiryPart = value.slice(0, separator);
  const signaturePart = value.slice(separator + 1);
  const expiry = Number(expiryPart);
  if (!Number.isFinite(expiry) || Date.now() > expiry) {
    return false;
  }
  const expected = await hmac(expiryPart, config.cms.previewToken!);
  return timingSafeEqual(signaturePart, expected);
}

/**
 * Verify a short-lived **preview grant** — the signed entry ticket minted by the
 * CMS admin ("Preview" action) and presented once to the enter-preview endpoint.
 * Unlike the raw `previewToken`, a grant carries its own expiry and never
 * exposes the long-lived secret in a URL or admin HTML.
 *
 * Format: `g1.<expiryMs>.<base64url-hmac>`, where the HMAC (keyed by
 * `previewToken`) signs the literal `g1.<expiryMs>` — so the Laravel minter and
 * this verifier agree byte-for-byte (both standard HMAC-SHA256 + base64url).
 */
export async function verifyPreviewGrant(token: string | null | undefined): Promise<boolean> {
  if (typeof token !== 'string' || token === '' || !isPreviewConfigured()) {
    return false;
  }
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== 'g1') {
    return false;
  }
  const expiryPart = parts[1]!;
  const signaturePart = parts[2]!;
  const expiry = Number(expiryPart);
  if (!Number.isFinite(expiry) || Date.now() > expiry) {
    return false;
  }
  const expected = await hmac(`g1.${expiryPart}`, config.cms.previewToken!);
  return timingSafeEqual(signaturePart, expected);
}

export interface PreviewCookieOptions {
  httpOnly: true;
  secure: boolean;
  sameSite: 'lax';
  path: string;
  maxAge: number;
}

/**
 * Cookie attributes for the preview session. `secure` is caller-supplied so the
 * cookie still sets over plain http on localhost while staying Secure in prod
 * (derive it from the request protocol). Scoped to `/preview` so it is never
 * sent to public routes.
 */
export function previewCookieOptions(secure: boolean, maxAge: number): PreviewCookieOptions {
  return {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/preview',
    maxAge,
  };
}
