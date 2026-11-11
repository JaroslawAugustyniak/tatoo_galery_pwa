import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const COOKIE = "tg_session";
const TTL_MS = 30 * 24 * 3600 * 1000; // tablet na targach - długa sesja

export function sign(payload: string): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16) throw new Error("SESSION_SECRET (min. 16 znaków) nie jest ustawiony");
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createSessionToken(artistId: string): string {
  const payload = `${artistId}.${Date.now() + TTL_MS}`;
  return `${payload}.${sign(payload)}`;
}

function verify(token: string | undefined): string | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [artistId, exp, sig] = parts;
  const expected = Buffer.from(sign(`${artistId}.${exp}`));
  const given = Buffer.from(sig);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  return Number(exp) > Date.now() ? artistId : null;
}

/** Id zalogowanego tatuatora (tenanta) albo null. */
export function getSessionArtistId(): string | null {
  return verify(cookies().get(COOKIE)?.value);
}

export function setSessionCookie(artistId: string) {
  cookies().set(COOKIE, createSessionToken(artistId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.COOKIE_SECURE === "true",
    path: "/",
    maxAge: TTL_MS / 1000,
  });
}

export function clearSessionCookie() {
  cookies().delete(COOKIE);
}
