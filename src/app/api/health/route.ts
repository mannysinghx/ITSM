import { NextResponse } from "next/server";

/** Liveness probe — process is up. */
export function GET() {
  return NextResponse.json({ status: "ok" });
}
