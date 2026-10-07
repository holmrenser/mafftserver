import { NextResponse } from "next/server";

/** Pure liveness - no DB touch, so a transient Postgres blip doesn't kill an otherwise-healthy container. */
export async function GET() {
  return NextResponse.json({ status: "ok" });
}
