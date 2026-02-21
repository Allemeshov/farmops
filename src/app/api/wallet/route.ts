import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const wallet = await prisma.wallet.findUnique({
    where: { userId: session.user.id },
  });

  const recentRewards = await prisma.reward.findMany({
    where: { userId: session.user.id },
    include: { task: { select: { title: true, taskType: true } } },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  return NextResponse.json({
    balance: wallet?.balance ?? 0,
    recentRewards,
  });
}
