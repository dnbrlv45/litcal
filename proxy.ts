import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "litcal_session";

const publicRoutes = [
  /^\/$/,
  /^\/sign-in(?:\/.*)?$/,
  /^\/sign-up(?:\/.*)?$/,
  /^\/privacy$/, // must be reachable without a session for Google OAuth verification review
  /^\/terms$/,   // same
  /^\/api\/auth\/google\/sign-in(?:\/.*)?$/,
  /^\/api\/auth\/sign-out$/,
  /^\/api\/cron\//, // cron-job.org has no session cookie
  /^\/api\/ai-inbox\/gmail-webhook$/, // Gmail Pub/Sub push; authenticates via ?secret= param, no session cookie
];

function isPublicRoute(pathname: string) {
  return publicRoutes.some((route) => route.test(pathname));
}

export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublicRoute(pathname)) {
    return NextResponse.next();
  }

  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE)?.value);

  if (pathname.startsWith("/api/")) {
    if (hasSession) return NextResponse.next();
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!hasSession) {
    return NextResponse.redirect(new URL("/sign-in", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
