import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/** Readiness probe — process is up AND the database is reachable. */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ready", db: "ok" });
  } catch {
    return NextResponse.json({ status: "not_ready", db: "down" }, { status: 503 });
  }
}
