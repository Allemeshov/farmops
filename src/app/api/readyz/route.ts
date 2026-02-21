import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(): Promise<NextResponse> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ready" });
  } catch {
    return NextResponse.json({ status: "not ready" }, { status: 503 });
  }
}
