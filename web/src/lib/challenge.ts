import { randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import type { AuthPurpose } from "@prisma/client";
import { prisma } from "./prisma";
import { sign } from "./session";
import { sendCodeMail } from "./mail";

export const CODE_TTL_MIN = 10;
const MAX_ATTEMPTS = 5;
const MAX_RESENDS = 5;
export const RESEND_COOLDOWN_S = 60;

const newCode = () => String(randomInt(0, 1_000_000)).padStart(6, "0");
const hashCode = (id: string, code: string) => sign(`code:${id}:${code}`);

export const normalizeEmail = (v: unknown) => String(v ?? "").trim().toLowerCase();

export function maskEmail(email: string): string {
  const [user, domain = ""] = email.split("@");
  return `${user.slice(0, 1)}${"*".repeat(Math.max(2, Math.min(user.length - 1, 6)))}@${domain}`;
}

/**
 * Tworzy wyzwanie i wysyła kod. artistId = null => wabik dla nieistniejącego maila
 * (zachowuje się tak samo, ale nic nie wysyła) – chroni przed enumeracją kont.
 * Powtórne wywołanie w czasie cooldownu zwraca to samo wyzwanie bez nowego maila.
 */
export async function issueChallenge(email: string, artistId: string | null, purpose: AuthPurpose): Promise<string> {
  const now = new Date();
  await prisma.authChallenge.deleteMany({ where: { expiresAt: { lt: now } } });

  const existing = await prisma.authChallenge.findFirst({ where: { email, purpose } });
  if (existing && now.getTime() - existing.lastSentAt.getTime() < RESEND_COOLDOWN_S * 1000) return existing.id;
  if (existing) await prisma.authChallenge.delete({ where: { id: existing.id } });

  const id = randomBytes(18).toString("base64url");
  const code = newCode();
  await prisma.authChallenge.create({
    data: {
      id,
      email,
      artistId,
      purpose,
      codeHash: hashCode(id, code),
      lastSentAt: now,
      expiresAt: new Date(now.getTime() + CODE_TTL_MIN * 60_000),
    },
  });

  if (artistId) {
    try {
      await sendCodeMail(email, code, purpose, CODE_TTL_MIN);
    } catch (e) {
      await prisma.authChallenge.delete({ where: { id } }).catch(() => undefined);
      throw e;
    }
  }
  return id;
}

export type ResendResult = { ok: true } | { ok: false; status: number; error: string };

export async function resendChallenge(id: string): Promise<ResendResult> {
  const ch = await prisma.authChallenge.findUnique({ where: { id } });
  if (!ch || ch.expiresAt < new Date()) return { ok: false, status: 410, error: "Wyzwanie wygasło. Zacznij od nowa." };
  const wait = RESEND_COOLDOWN_S * 1000 - (Date.now() - ch.lastSentAt.getTime());
  if (wait > 0) return { ok: false, status: 429, error: `Poczekaj ${Math.ceil(wait / 1000)} s przed ponowną wysyłką` };
  if (ch.resends >= MAX_RESENDS) return { ok: false, status: 429, error: "Przekroczono limit wysyłek. Zacznij od nowa." };

  const code = newCode();
  await prisma.authChallenge.update({
    where: { id },
    data: {
      codeHash: hashCode(id, code),
      attempts: 0,
      resends: { increment: 1 },
      lastSentAt: new Date(),
      expiresAt: new Date(Date.now() + CODE_TTL_MIN * 60_000),
    },
  });
  if (ch.artistId) await sendCodeMail(ch.email, code, ch.purpose, CODE_TTL_MIN);
  return { ok: true };
}

export type VerifyResult = { ok: true; artistId: string } | { ok: false; status: number; error: string };

/** Sprawdza kod; poprawny kod zużywa wyzwanie (jednorazowy). */
export async function verifyChallenge(id: string, rawCode: unknown, purpose: AuthPurpose): Promise<VerifyResult> {
  const gone: VerifyResult = { ok: false, status: 410, error: "Kod wygasł. Poproś o nowy." };
  const code = String(rawCode ?? "").replace(/\s/g, "");
  const ch = await prisma.authChallenge.findUnique({ where: { id } });
  if (!ch || ch.purpose !== purpose || ch.expiresAt < new Date()) return gone;

  // licznik zwiększany atomowo PRZED porównaniem – równoległe zgadywanie nie obejdzie limitu
  const { attempts } = await prisma.authChallenge.update({ where: { id }, data: { attempts: { increment: 1 } } });
  if (attempts > MAX_ATTEMPTS) {
    await prisma.authChallenge.delete({ where: { id } }).catch(() => undefined);
    return { ok: false, status: 410, error: "Zbyt wiele prób. Poproś o nowy kod." };
  }

  const a = Buffer.from(hashCode(id, code));
  const b = Buffer.from(ch.codeHash);
  const match = /^\d{6}$/.test(code) && a.length === b.length && timingSafeEqual(a, b);
  if (!match || !ch.artistId) {
    return { ok: false, status: 400, error: `Nieprawidłowy kod (pozostało prób: ${MAX_ATTEMPTS - attempts})` };
  }
  await prisma.authChallenge.delete({ where: { id } }).catch(() => undefined);
  return { ok: true, artistId: ch.artistId };
}
