import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { TaskStatus } from "@prisma/client";
import { CheckCircle2, Clock, Coins, GitPullRequest } from "lucide-react";
import Link from "next/link";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const userId = session.user.id;

  const [wallet, openTasks, doneTasks, recentRewards] = await Promise.all([
    prisma.wallet.findUnique({ where: { userId } }),
    prisma.task.count({
      where: {
        org: { members: { some: { userId } } },
        status: TaskStatus.OPEN,
      },
    }),
    prisma.task.count({
      where: {
        org: { members: { some: { userId } } },
        status: TaskStatus.DONE,
      },
    }),
    prisma.reward.findMany({
      where: { userId },
      include: { task: { select: { title: true, taskType: true, url: true } } },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
  ]);

  const stats = [
    { label: "Coin Balance", value: wallet?.balance ?? 0, icon: Coins, color: "text-yellow-500" },
    { label: "Open Tasks", value: openTasks, icon: Clock, color: "text-blue-500" },
    { label: "Completed Tasks", value: doneTasks, icon: CheckCircle2, color: "text-green-500" },
    { label: "Total Earned", value: recentRewards.reduce((s, r) => s + r.totalCoins, 0), icon: GitPullRequest, color: "text-purple-500" },
  ];

  const taskTypeColors: Record<string, string> = {
    MAINTENANCE: "bg-blue-100 text-blue-700",
    TOIL: "bg-orange-100 text-orange-700",
    RELIABILITY: "bg-green-100 text-green-700",
    SECURITY: "bg-red-100 text-red-700",
  };

  return (
    <div className="p-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Welcome back, {session.user.name} 👋</h1>
        <p className="text-muted-foreground mt-1">Here&apos;s your FarmOps overview.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-card rounded-xl border border-border p-5 flex items-center gap-4">
            <div className={`p-3 rounded-lg bg-muted ${color}`}>
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold">{value.toLocaleString()}</p>
              <p className="text-sm text-muted-foreground">{label}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-card rounded-xl border border-border p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Recent Rewards</h2>
          <Link href="/dashboard/wallet" className="text-sm text-primary hover:underline">View all</Link>
        </div>
        {recentRewards.length === 0 ? (
          <p className="text-muted-foreground text-sm">No rewards yet. Complete a labeled PR to earn coins!</p>
        ) : (
          <div className="space-y-3">
            {recentRewards.map((reward) => (
              <div key={reward.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                <div className="flex items-center gap-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${taskTypeColors[reward.task.taskType]}`}>
                    {reward.task.taskType}
                  </span>
                  <a href={reward.task.url} target="_blank" rel="noopener noreferrer" className="text-sm hover:underline truncate max-w-xs">
                    {reward.task.title}
                  </a>
                </div>
                <span className="text-sm font-semibold text-yellow-600">+{reward.totalCoins} 🪙</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-gradient-to-r from-green-50 to-yellow-50 border border-green-200 rounded-xl p-6">
        <h2 className="text-lg font-semibold text-green-800 mb-2">🌾 Quick Start</h2>
        <ol className="list-decimal list-inside space-y-1 text-sm text-green-700">
          <li>Enable repositories in <Link href="/dashboard/repos" className="underline font-medium">Repositories</Link></li>
          <li>Add labels (<code className="bg-green-100 px-1 rounded">maintenance</code>, <code className="bg-green-100 px-1 rounded">toil</code>, <code className="bg-green-100 px-1 rounded">reliability</code>, <code className="bg-green-100 px-1 rounded">security</code>) to GitHub Issues or PRs</li>
          <li>Merge a PR — coins are awarded automatically</li>
          <li>Spend coins on <Link href="/dashboard/shop" className="underline font-medium">Farm upgrades</Link> to boost future rewards</li>
        </ol>
      </div>
    </div>
  );
}
