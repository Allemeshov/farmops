"use client";

import { useEffect, useState } from "react";
import { ShoppingBag, Coins } from "lucide-react";
import { cn } from "@/lib/utils";

type ShopItem = {
  id: string;
  slug: string;
  name: string;
  description: string;
  icon: string;
  baseCost: number;
  maxLevel: number;
  multiplier: number;
  taskType: string | null;
};

type Org = { id: string; login: string; name: string | null };

export default function ShopPage() {
  const [items, setItems] = useState<ShopItem[]>([]);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [selectedOrg, setSelectedOrg] = useState<string>("");
  const [balance, setBalance] = useState<number>(0);
  const [buying, setBuying] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/shop").then((r) => r.json()),
      fetch("/api/orgs/me").then((r) => r.json()),
      fetch("/api/wallet").then((r) => r.json()),
    ]).then(([shopData, orgData, walletData]) => {
      setItems(shopData);
      setOrgs(orgData);
      if (orgData.length > 0) setSelectedOrg(orgData[0].id);
      setBalance(walletData.balance ?? 0);
    });
  }, []);

  async function handleBuy(shopItemId: string, cost: number) {
    if (!selectedOrg) return;
    setBuying(shopItemId);
    setMessage(null);
    try {
      const res = await fetch("/api/shop/buy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shopItemId, orgId: selectedOrg }),
      });
      const data = await res.json() as { ok?: boolean; error?: string; level?: number; cost?: number };
      if (data.ok) {
        setBalance((b) => b - (data.cost ?? cost));
        setMessage({ text: `Upgraded to level ${data.level}! 🎉`, ok: true });
      } else {
        setMessage({ text: data.error ?? "Purchase failed", ok: false });
      }
    } catch {
      setMessage({ text: "Network error", ok: false });
    } finally {
      setBuying(null);
    }
  }

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Shop</h1>
          <p className="text-muted-foreground mt-1">Spend coins on farm upgrades to boost your rewards.</p>
        </div>
        <div className="flex items-center gap-4">
          {orgs.length > 1 && (
            <select
              value={selectedOrg}
              onChange={(e) => setSelectedOrg(e.target.value)}
              className="border border-border rounded-lg px-3 py-2 text-sm bg-card"
            >
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>{o.name ?? o.login}</option>
              ))}
            </select>
          )}
          <div className="flex items-center gap-2 bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-2">
            <Coins className="h-4 w-4 text-yellow-600" />
            <span className="font-bold text-yellow-700">{balance.toLocaleString()} coins</span>
          </div>
        </div>
      </div>

      {message && (
        <div className={cn(
          "rounded-lg px-4 py-3 text-sm font-medium",
          message.ok ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"
        )}>
          {message.text}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {items.map((item) => {
          const cost = item.baseCost;
          const canAfford = balance >= cost;
          return (
            <div key={item.id} className="bg-card border border-border rounded-xl p-5 flex flex-col gap-4">
              <div className="flex items-start gap-3">
                <span className="text-4xl">{item.icon}</span>
                <div className="flex-1">
                  <p className="font-semibold">{item.name}</p>
                  <p className="text-sm text-muted-foreground">{item.description}</p>
                </div>
              </div>
              <div className="text-xs text-muted-foreground space-y-1">
                <p>Multiplier: ×{item.multiplier} per level</p>
                <p>Max level: {item.maxLevel}</p>
                {item.taskType && <p>Applies to: {item.taskType}</p>}
              </div>
              <div className="flex items-center justify-between mt-auto">
                <span className="flex items-center gap-1 font-semibold text-yellow-600">
                  <Coins className="h-4 w-4" />
                  {cost.toLocaleString()} coins
                </span>
                <button
                  onClick={() => handleBuy(item.id, cost)}
                  disabled={!canAfford || buying === item.id || !selectedOrg}
                  className={cn(
                    "px-4 py-2 rounded-lg text-sm font-semibold transition-colors",
                    canAfford && selectedOrg
                      ? "bg-primary text-primary-foreground hover:bg-primary/90"
                      : "bg-muted text-muted-foreground cursor-not-allowed"
                  )}
                >
                  {buying === item.id ? "Buying…" : "Buy / Upgrade"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
