import { NextResponse } from "next/server";
import { resendChallenge } from "@/lib/challenge";

export const dynamic = "force-dynamic";

/** POST { challengeId } – ponowna wysyłka kodu (cooldown 60 s, max 5 razy). */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  try {
    const r = await resendChallenge(String(body?.challengeId ?? ""));
    return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: r.status });
  } catch (e) {
    console.error("resend", e);
    return NextResponse.json({ error: "Nie udało się wysłać kodu" }, { status: 503 });
  }
}
