import { prisma } from "@/lib/prisma";

export async function recomputeWallet(): Promise<void> {
  const wallets = await prisma.wallet.findMany();

  for (const wallet of wallets) {
    try {
      if (wallet.userId) {
        const rewards = await prisma.reward.aggregate({
          where: { userId: wallet.userId },
          _sum: { totalCoins: true },
        });
        const purchases = await prisma.purchase.aggregate({
          where: { walletId: wallet.id },
          _sum: { cost: true },
        });
        const balance =
          (rewards._sum.totalCoins ?? 0) - (purchases._sum.cost ?? 0);
        await prisma.wallet.update({
          where: { id: wallet.id },
          data: { balance },
        });
      } else if (wallet.orgId) {
        const orgRewards = await prisma.reward.findMany({
          where: {
            task: { orgId: wallet.orgId },
          },
          select: { totalCoins: true },
        });
        const totalEarned = orgRewards.reduce((sum, r) => sum + r.totalCoins, 0);
        const purchases = await prisma.purchase.aggregate({
          where: { walletId: wallet.id },
          _sum: { cost: true },
        });
        const balance = totalEarned - (purchases._sum.cost ?? 0);
        await prisma.wallet.update({
          where: { id: wallet.id },
          data: { balance },
        });
      }
    } catch (err) {
      console.error(`[recompute_wallet] Failed for wallet ${wallet.id}:`, err);
    }
  }

  console.log(`[recompute_wallet] Recomputed ${wallets.length} wallets.`);
}
