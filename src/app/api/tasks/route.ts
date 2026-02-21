import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const orgId = searchParams.get("orgId");

  const memberships = await prisma.orgMember.findMany({
    where: { userId: session.user.id },
    select: { orgId: true },
  });
  const orgIds = memberships.map((m) => m.orgId);

  const tasks = await prisma.task.findMany({
    where: {
      orgId: orgId ? orgId : { in: orgIds },
      ...(status ? { status: status as never } : {}),
    },
    include: {
      repo: { select: { fullName: true } },
      reward: { select: { totalCoins: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return NextResponse.json(tasks);
}
