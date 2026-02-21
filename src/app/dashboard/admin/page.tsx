"use client";

import { useState } from "react";
import { RefreshCw, Settings, CheckCircle2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export default function AdminPage() {
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ ok: boolean; message: string } | null>(null);

  async function handleSync() {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch("/api/admin/sync", { method: "POST" });
      const data = await res.json() as { ok?: boolean; error?: string };
      setSyncResult(
        data.ok
          ? { ok: true, message: "Sync job enqueued. Repositories will update shortly." }
          : { ok: false, message: data.error ?? "Sync failed" }
      );
    } catch {
      setSyncResult({ ok: false, message: "Network error" });
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="p-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Admin</h1>
        <p className="text-muted-foreground mt-1">Manage FarmOps configuration and operations.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-card border border-border rounded-xl p-6 space-y-4">
          <div className="flex items-center gap-3">
            <RefreshCw className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Sync Repositories</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Trigger an immediate sync of all repositories from GitHub App installations.
            This runs automatically every 6 hours.
          </p>
          {syncResult && (
            <div className={cn(
              "flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium",
              syncResult.ok
                ? "bg-green-50 text-green-700 border border-green-200"
                : "bg-red-50 text-red-700 border border-red-200"
            )}>
              {syncResult.ok
                ? <CheckCircle2 className="h-4 w-4 shrink-0" />
                : <AlertCircle className="h-4 w-4 shrink-0" />}
              {syncResult.message}
            </div>
          )}
          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={cn("h-4 w-4", syncing && "animate-spin")} />
            {syncing ? "Syncing…" : "Sync Now"}
          </button>
        </div>

        <div className="bg-card border border-border rounded-xl p-6 space-y-4">
          <div className="flex items-center gap-3">
            <Settings className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Configuration</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Scoring parameters are managed via the database <code className="bg-muted px-1 rounded">Config</code> table
            and environment variables. Use <code className="bg-muted px-1 rounded">prisma studio</code> or
            the seed script to update values.
          </p>
          <div className="bg-muted/50 rounded-lg p-4 text-xs font-mono space-y-1 text-muted-foreground">
            <p>FARMOPS_VERIFICATION_MODE=checks|merge_only</p>
            <p>FARMOPS_LABELS=maintenance,toil,reliability,security</p>
          </div>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-6 space-y-4">
        <h2 className="text-lg font-semibold">Scoring Reference</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { type: "MAINTENANCE", base: 10, color: "bg-blue-100 text-blue-700" },
            { type: "TOIL", base: 15, color: "bg-orange-100 text-orange-700" },
            { type: "RELIABILITY", base: 20, color: "bg-green-100 text-green-700" },
            { type: "SECURITY", base: 25, color: "bg-red-100 text-red-700" },
          ].map(({ type, base, color }) => (
            <div key={type} className="bg-muted/50 rounded-lg p-4 text-center">
              <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", color)}>{type}</span>
              <p className="text-2xl font-bold mt-2">{base}</p>
              <p className="text-xs text-muted-foreground">base coins</p>
            </div>
          ))}
        </div>
        <div className="text-sm text-muted-foreground space-y-1">
          <p><strong>Formula:</strong> <code className="bg-muted px-1 rounded">coins = round(base × verify_mult × size_mult × upgrade_mult)</code></p>
          <p><strong>Verification:</strong> CI checks passed → ×1.25 · Merge only → ×1.0</p>
          <p><strong>Size:</strong> Small (&lt;100 LOC) → ×1.0 · Medium → ×1.1 · Large (&gt;500 LOC) → ×1.2</p>
        </div>
      </div>
    </div>
  );
}
