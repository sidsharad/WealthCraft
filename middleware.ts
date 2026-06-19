import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";
import { NextResponse } from "next/server";

export const middleware = NextAuth(authConfig).auth((req) => {
  const { pathname } = req.nextUrl;

  // Always allow local pass-and-play — no auth needed
  const isLocalMode =
    pathname.startsWith("/room/play-local") ||
    (pathname.startsWith("/lobby") &&
      req.nextUrl.searchParams.get("mode") === "local");

  if (isLocalMode) {
    return NextResponse.next();
  }

  // All other routes are allowed
  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\..*|$).*)",
  ],
};
