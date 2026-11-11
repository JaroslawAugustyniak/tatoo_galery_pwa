import { NextRequest, NextResponse } from "next/server";

const ROOT_DOMAIN = process.env.ROOT_DOMAIN ?? "tattoo.localhost";
// Ścieżki wspólne dla wszystkich hostów (nie są rewritowane na /t/{slug})
const SHARED = ["/admin"];

/**
 * Rozpoznawanie tenanta:
 *  - subdomena:  janedoe.tattoo.localhost/…  -> rewrite na /t/janedoe/…
 *  - ścieżka:    tattoo.localhost/t/janedoe/… (bez zmian)
 * Nagłówek x-tenant-base mówi stronom, pod jakim prefiksem działa galeria ("" lub "/t/slug").
 */
export function middleware(req: NextRequest) {
  const host = (req.headers.get("host") ?? "").split(":")[0].toLowerCase();
  const { pathname } = req.nextUrl;
  const headers = new Headers(req.headers);

  const sub = host.endsWith(`.${ROOT_DOMAIN}`) ? host.slice(0, -(ROOT_DOMAIN.length + 1)) : "";
  if (sub && sub !== "www" && !sub.includes(".") && !SHARED.some((p) => pathname.startsWith(p))) {
    headers.set("x-tenant-base", "");
    const url = req.nextUrl.clone();
    url.pathname = `/t/${sub}${pathname === "/" ? "" : pathname}`;
    return NextResponse.rewrite(url, { request: { headers } });
  }

  const m = pathname.match(/^\/t\/([^/]+)/);
  if (m) headers.set("x-tenant-base", `/t/${m[1]}`);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/((?!_next/|api/|icons/|sw\\.js|swe-worker|favicon).*)"],
};
