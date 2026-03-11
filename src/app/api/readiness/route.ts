import { NextResponse } from "next/server";

import { prisma } from "../../../lib/prisma";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({
      status: "ready",
      service: "atlas-payments",
      checks: { database: "ok" },
      timestamp: new Date().toISOString(),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      {
        status: "not_ready",
        service: "atlas-payments",
        checks: { database: "error" },
        error: msg,
        hasDbUrl: !!process.env.DATABASE_URL,
        dbUrlPrefix: process.env.DATABASE_URL?.substring(0, 15) ?? "unset",
        timestamp: new Date().toISOString(),
      },
      { status: 503 },
    );
  }
}
