"use client";

import { useEffect, useState } from "react";
import { Sprout, GitBranch } from "lucide-react";

type ShopItem = {
  id: string;
  slug: string;
  name: string;
  icon: string;
  multiplier: number;
  taskType: string | null;
};

type FarmUpgrade = {
  id: string;
  level: number;
  shopItem: ShopItem;
};

type Plot = { id: string; fullName: string };

type FarmData = {
  id: string;
  name: string;
  upgrades: FarmUpgrade[];
  plots: Plot[];
};

type Org = { id: string; login: string; name: string | null };

export default function FarmPage() {
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [selectedOrg, setSelectedOrg] = useState<string>("");
  const [farm, setFarm] = useState<FarmData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/orgs/me")
      .then((r) => r.json())
      .then((data: Org[]) => {
        setOrgs(data);
        if (data.length > 0) setSelectedOrg(data[0].id);
      });
  }, []);

  useEffect(() => {
    if (!selectedOrg) return;
    setLoading(true);
    fetch(`/api/farm?orgId=${selectedOrg}`)
      .then((r) => r.json())
      .then((d) => { setFarm(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [selectedOrg]);

  const maxLevel = 3;

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Cloud Farm</h1>
          <p className="text-muted-foreground mt-1">Your farm upgrades and active repository plots.</p>
        </div>
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
      </div>

      {loading ? (
        <p className="text-muted-foreground text-sm">Loading farm…</p>
      ) : !farm ? (
        <p className="text-muted-foreground text-sm">Select an organization to view your farm.</p>
      ) : (
        <>
          <div>
            <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <Sprout className="h-5 w-5 text-primary" /> Active Upgrades
            </h2>
            {farm.upgrades.length === 0 ? (
              <div className="bg-card border border-border rounded-xl p-6 text-center text-muted-foreground text-sm">
                No upgrades yet. Visit the <a href="/dashboard/shop" className="text-primary underline">Shop</a> to buy your first upgrade.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {farm.upgrades.map((upgrade) => (
                  <div key={upgrade.id} className="bg-card border border-border rounded-xl p-5 space-y-3">
                    <div className="flex items-center gap-3">
                      <span className="text-3xl">{upgrade.shopItem.icon}</span>
                      <div>
                        <p className="font-semibold">{upgrade.shopItem.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {upgrade.shopItem.taskType ? `Boosts ${upgrade.shopItem.taskType}` : "Universal boost"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {Array.from({ length: maxLevel }).map((_, i) => (
                        <div
                          key={i}
                          className={`h-2 flex-1 rounded-full ${i < upgrade.level ? "bg-primary" : "bg-muted"}`}
                        />
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Level {upgrade.level}/{maxLevel} · ×{Math.pow(upgrade.shopItem.multiplier, upgrade.level).toFixed(3)} multiplier
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <GitBranch className="h-5 w-5 text-primary" /> Repository Plots ({farm.plots.length})
            </h2>
            {farm.plots.length === 0 ? (
              <div className="bg-card border border-border rounded-xl p-6 text-center text-muted-foreground text-sm">
                No enabled repositories. Visit <a href="/dashboard/repos" className="text-primary underline">Repositories</a> to enable some.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {farm.plots.map((plot) => (
                  <div key={plot.id} className="bg-card border border-border rounded-lg p-4 flex items-center gap-3">
                    <div className="text-2xl">🌱</div>
                    <div>
                      <p className="font-medium text-sm">{plot.fullName}</p>
                      <p className="text-xs text-muted-foreground">Active plot</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
