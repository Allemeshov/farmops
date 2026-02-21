import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json() as { shopItemId: string; orgId: string };
  const { shopItemId, orgId } = body;

  const membership = await prisma.orgMember.findFirst({
    where: { userId: session.user.id, orgId },
  });
  if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const shopItem = await prisma.shopItem.findUnique({ where: { id: shopItemId } });
  if (!shopItem) return NextResponse.json({ error: "Item not found" }, { status: 404 });

  let farm = await prisma.farm.findUnique({ where: { orgId } });
  if (!farm) {
    farm = await prisma.farm.create({ data: { orgId } });
  }

  const existingUpgrade = await prisma.farmUpgrade.findUnique({
    where: { farmId_shopItemId: { farmId: farm.id, shopItemId } },
  });

  const currentLevel = existingUpgrade?.level ?? 0;
  if (currentLevel >= shopItem.maxLevel) {
    return NextResponse.json({ error: "Already at max level" }, { status: 400 });
  }

  const nextLevel = currentLevel + 1;
  const cost = shopItem.baseCost * nextLevel;

  const orgWallet = await prisma.wallet.findUnique({ where: { orgId } });
  const balance = orgWallet?.balance ?? 0;
  if (balance < cost) {
    return NextResponse.json({ error: "Insufficient coins" }, { status: 400 });
  }

  await prisma.$transaction(async (tx) => {
    if (!orgWallet) {
      throw new Error("No org wallet found");
    }
    await tx.wallet.update({
      where: { orgId },
      data: { balance: { decrement: cost } },
    });

    await tx.purchase.create({
      data: {
        walletId: orgWallet.id,
        orgId,
        shopItemId,
        level: nextLevel,
        cost,
      },
    });

    if (existingUpgrade) {
      await tx.farmUpgrade.update({
        where: { id: existingUpgrade.id },
        data: { level: nextLevel },
      });
    } else {
      await tx.farmUpgrade.create({
        data: { farmId: farm!.id, shopItemId, level: nextLevel },
      });
    }
  });

  return NextResponse.json({ ok: true, level: nextLevel, cost });
}
