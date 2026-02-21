"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Clock, GitPullRequest, AlertCircle, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

type Task = {
  id: string;
  title: string;
  url: string;
  status: string;
  taskType: string;
  sourceType: string;
  labels: string[];
  createdAt: string;
  repo: { fullName: string };
  reward: { totalCoins: number } | null;
};

const statusConfig: Record<string, { label: string; icon: typeof Clock; color: string }> = {
  OPEN: { label: "Open", icon: Clock, color: "text-blue-500" },
  IN_PROGRESS: { label: "In Progress", icon: GitPullRequest, color: "text-yellow-500" },
  DONE: { label: "Done", icon: CheckCircle2, color: "text-green-500" },
  CANCELLED: { label: "Cancelled", icon: AlertCircle, color: "text-gray-400" },
};

const taskTypeColors: Record<string, string> = {
  MAINTENANCE: "bg-blue-100 text-blue-700",
  TOIL: "bg-orange-100 text-orange-700",
  RELIABILITY: "bg-green-100 text-green-700",
  SECURITY: "bg-red-100 text-red-700",
};

const STATUSES = ["ALL", "OPEN", "IN_PROGRESS", "DONE", "CANCELLED"];

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [filter, setFilter] = useState("ALL");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const params = filter !== "ALL" ? `?status=${filter}` : "";
    fetch(`/api/tasks${params}`)
      .then((r) => r.json())
      .then((data) => { setTasks(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [filter]);

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Tasks</h1>
        <p className="text-muted-foreground mt-1">All mined maintenance tasks from GitHub.</p>
      </div>

      <div className="flex gap-2 flex-wrap">
        {STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={cn(
              "px-4 py-1.5 rounded-full text-sm font-medium border transition-colors",
              filter === s
                ? "bg-primary text-primary-foreground border-primary"
                : "border-border text-muted-foreground hover:border-primary hover:text-primary"
            )}
          >
            {s === "ALL" ? "All" : statusConfig[s]?.label ?? s}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-muted-foreground text-sm">Loading tasks…</div>
      ) : tasks.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-8 text-center text-muted-foreground">
          No tasks found. Add labels to GitHub Issues or PRs to start mining tasks.
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Task</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Type</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Repo</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Reward</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((task) => {
                const sc = statusConfig[task.status];
                const Icon = sc?.icon ?? Clock;
                return (
                  <tr key={task.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <a
                        href={task.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 hover:text-primary font-medium"
                      >
                        {task.title}
                        <ExternalLink className="h-3 w-3 opacity-50" />
                      </a>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", taskTypeColors[task.taskType])}>
                        {task.taskType}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn("flex items-center gap-1.5", sc?.color)}>
                        <Icon className="h-3.5 w-3.5" />
                        {sc?.label ?? task.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{task.repo.fullName}</td>
                    <td className="px-4 py-3">
                      {task.reward ? (
                        <span className="font-semibold text-yellow-600">+{task.reward.totalCoins} 🪙</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
