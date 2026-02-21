"use client";

import { useEffect, useState } from "react";
import { Coins, TrendingUp } from "lucide-react";

type Reward = {
  id: string;
  totalCoins: number;
  baseCoins: number;
  verificationMultiplier: number;
  sizeMultiplier: number;
  upgradeMultiplier: number;
  createdAt: string;
  task: { title: string; taskType: string };
};

type WalletData = {
  balance: number;
  recentRewards: Reward[];
};

const taskTypeColors: Record<string, string> = {
  MAINTENANCE: "bg-blue-100 text-blue-700",
  TOIL: "bg-orange-100 text-orange-700",
  RELIABILITY: "bg-green-100 text-green-700",
  SECURITY: "bg-red-100 text-red-700",
};

export default function WalletPage() {
  const [data, setData] = useState<WalletData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/wallet")
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Wallet</h1>
        <p className="text-muted-foreground mt-1">Your coin balance and reward history.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-gradient-to-br from-yellow-400 to-yellow-500 rounded-2xl p-6 text-white shadow-lg">
          <div className="flex items-center gap-3 mb-4">
            <Coins className="h-8 w-8" />
            <span className="text-lg font-semibold">Coin Balance</span>
          </div>
          <p className="text-5xl font-bold">{loading ? "…" : (data?.balance ?? 0).toLocaleString()}</p>
          <p className="text-yellow-100 mt-1 text-sm">Available to spend in the Shop</p>
        </div>

        <div className="bg-card border border-border rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <TrendingUp className="h-6 w-6 text-primary" />
            <span className="text-lg font-semibold">Total Earned</span>
          </div>
          <p className="text-4xl font-bold text-primary">
            {loading ? "…" : (data?.recentRewards.reduce((s, r) => s + r.totalCoins, 0) ?? 0).toLocaleString()}
          </p>
          <p className="text-muted-foreground mt-1 text-sm">From last 10 rewards shown</p>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-6">
        <h2 className="text-lg font-semibold mb-4">Recent Rewards</h2>
        {loading ? (
          <p className="text-muted-foreground text-sm">Loading…</p>
        ) : !data?.recentRewards.length ? (
          <p className="text-muted-foreground text-sm">No rewards yet. Complete labeled PRs to earn coins!</p>
        ) : (
          <div className="space-y-3">
            {data.recentRewards.map((reward) => (
              <div key={reward.id} className="flex items-start justify-between py-3 border-b border-border last:border-0">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${taskTypeColors[reward.task.taskType]}`}>
                      {reward.task.taskType}
                    </span>
                    <span className="text-sm font-medium">{reward.task.title}</span>
                  </div>
                  <div className="text-xs text-muted-foreground flex gap-3">
                    <span>Base: {reward.baseCoins}</span>
                    <span>Verify: ×{reward.verificationMultiplier}</span>
                    <span>Size: ×{reward.sizeMultiplier}</span>
                    <span>Upgrade: ×{reward.upgradeMultiplier.toFixed(2)}</span>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-yellow-600">+{reward.totalCoins} 🪙</p>
                  <p className="text-xs text-muted-foreground">{new Date(reward.createdAt).toLocaleDateString()}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
