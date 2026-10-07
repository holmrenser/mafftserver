import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/** Readiness - confirms Postgres (also the pg-boss backend) is reachable. */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok" });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ status: "unavailable", error: message }, { status: 503 });
  }
}
