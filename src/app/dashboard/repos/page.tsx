"use client";

import { useEffect, useState } from "react";
import { GitBranch, Lock, Globe } from "lucide-react";
import { cn } from "@/lib/utils";

type Repo = {
  id: string;
  fullName: string;
  private: boolean;
  enabled: boolean;
  defaultBranch: string;
};

export default function ReposPage() {
  const [repos, setRepos] = useState<Repo[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/repos")
      .then((r) => r.json())
      .then((data) => { setRepos(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  async function toggleRepo(repo: Repo) {
    setToggling(repo.id);
    try {
      const res = await fetch(`/api/repos/${repo.id}/enable`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !repo.enabled }),
      });
      const updated = await res.json() as Repo;
      setRepos((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    } finally {
      setToggling(null);
    }
  }

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Repositories</h1>
        <p className="text-muted-foreground mt-1">
          Enable repositories to mine tasks from their Issues and Pull Requests.
        </p>
      </div>

      {loading ? (
        <p className="text-muted-foreground text-sm">Loading repositories…</p>
      ) : repos.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-8 text-center text-muted-foreground">
          <GitBranch className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="font-medium">No repositories found.</p>
          <p className="text-sm mt-1">Make sure the GitHub App is installed in your organization and trigger a sync from Admin.</p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Repository</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Default Branch</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Visibility</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Action</th>
              </tr>
            </thead>
            <tbody>
              {repos.map((repo) => (
                <tr key={repo.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-medium">{repo.fullName}</td>
                  <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{repo.defaultBranch}</td>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      {repo.private ? <Lock className="h-3.5 w-3.5" /> : <Globe className="h-3.5 w-3.5" />}
                      {repo.private ? "Private" : "Public"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn(
                      "text-xs px-2 py-0.5 rounded-full font-medium",
                      repo.enabled ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"
                    )}>
                      {repo.enabled ? "Enabled" : "Disabled"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => toggleRepo(repo)}
                      disabled={toggling === repo.id}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors",
                        repo.enabled
                          ? "bg-muted text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          : "bg-primary text-primary-foreground hover:bg-primary/90"
                      )}
                    >
                      {toggling === repo.id ? "…" : repo.enabled ? "Disable" : "Enable"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
