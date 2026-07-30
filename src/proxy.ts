import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, eventFromHost } from "@/lib/config";
import { verifySession } from "@/lib/auth/session";

/**
 * Host-based routing for the five-subdomain platform.
 *
 * NOTE ON THE FILENAME: Next.js 16 deprecated `middleware.ts` in favour of
 * `proxy.ts` (and the named export `middleware` → `proxy`). Unlike middleware,
 * proxy runs on the **Node.js** runtime and that is not configurable.
 *
 *   hunt.example.com/clue/3  →  rewrite → /hunt/clue/3   → app/(hunt)/...
 *   ctf.example.com/         →  rewrite → /ctf           → app/(ctf)/...
 *   app.example.com/enter    →  passthrough              → app/(app)/enter
 *
 * The rewrite is invisible to the user: the URL bar keeps the pretty
 * subdomain form while Next resolves a normal nested route.
 *
 * AUTH HERE IS OPTIMISTIC ONLY. Per the Next docs, proxy shouldn't be treated
 * as the authorization boundary — it exists to bounce logged-out users to the
 * entry page cheaply. Every route handler that mutates state re-verifies the
 * session itself (see `requireSession`). Losing that second check would be a
 * real vulnerability, not a style issue.
 */

/**
 * Paths that must never be rewritten or gated.
 *
 * `/adminofctf` is here because it is a ROOT-level route, not part of the /ctf
 * tree. Without this it would be rewritten to `/ctf/adminofctf` on the event
 * subdomain and 404 — the exact class of bug the `/api` passthrough below
 * exists to prevent, and equally invisible in local development where no
 * rewrite happens at all.
 */
const PUBLIC_PREFIXES = [
  "/_next",
  "/api/health",
  "/favicon.ico",
  "/enter",
  "/api/enter",
  "/adminofctf",
];

/**
 * Events whose front page is open to anyone with the link.
 *
 * CTF joins by typing a team name, so bouncing a visitor with no session to
 * /enter would send them to a code-redemption form for a code that no longer
 * exists — and the join form IS the page. The other three still expect a
 * pre-registered team.
 */
const PUBLIC_EVENTS = new Set(["ctf"]);

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }

  const host = request.headers.get("host");
  const event = eventFromHost(host);

  // Not an event subdomain (app.*, www.*, localhost) — serve as-is.
  if (!event) return NextResponse.next();

  // API ROUTES ARE NEVER REWRITTEN. There is no /app/ctf/api tree — the handlers
  // live at /api/* for every host — so prefixing the event would turn
  // `ctf.xplore26.xyz/api/submit` into `/ctf/api/submit` and 404 the whole
  // submission pipeline. This never showed up locally because `localhost` is not
  // an event host, so the rewrite branch is dead in development and live in
  // production. Handlers that need the event read it from the Host header.
  if (pathname.startsWith("/api/")) return NextResponse.next();

  // Optimistic session check. No DB read: just a signature verification.
  const session = await verifySession(request.cookies.get(SESSION_COOKIE)?.value);
  if (!session) {
    if (!PUBLIC_EVENTS.has(event)) {
      const entry = new URL("/enter", request.nextUrl.origin);
      // Send them back where they were trying to go once they're in.
      entry.searchParams.set("rt", `${request.nextUrl.origin}${pathname}${search}`);
      return NextResponse.redirect(entry);
    }

    // Public event, no session yet: rewrite so they land on the join form.
    const open = request.nextUrl.clone();
    open.pathname = `/${event}${pathname === "/" ? "" : pathname}`;
    return NextResponse.rewrite(open);
  }

  // Rewrite the subdomain into its route group segment.
  const url = request.nextUrl.clone();
  url.pathname = `/${event}${pathname === "/" ? "" : pathname}`;

  const res = NextResponse.rewrite(url);
  // Hand identity to route handlers so they don't each re-parse the cookie.
  // These are internal-only; they never reach the browser.
  res.headers.set("x-team-id", session.teamId);
  res.headers.set("x-participant-id", session.sub);
  res.headers.set("x-event", event);
  return res;
}

export const config = {
  /**
   * Skip static assets outright — running proxy on every chunk request would
   * add latency to page loads for no benefit.
   */
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|ico|webp|woff2?)$).*)"],
};
