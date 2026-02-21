import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get("orgId");
  if (!orgId) return NextResponse.json({ error: "orgId required" }, { status: 400 });

  const membership = await prisma.orgMember.findFirst({
    where: { userId: session.user.id, orgId },
  });
  if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let farm = await prisma.farm.findUnique({
    where: { orgId },
    include: {
      upgrades: { include: { shopItem: true } },
    },
  });

  if (!farm) {
    farm = await prisma.farm.create({
      data: { orgId },
      include: { upgrades: { include: { shopItem: true } } },
    });
  }

  const repos = await prisma.repository.findMany({
    where: { orgId, enabled: true },
    select: { id: true, fullName: true },
  });

  return NextResponse.json({ ...farm, plots: repos });
}
