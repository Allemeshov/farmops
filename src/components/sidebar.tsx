"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  LayoutDashboard,
  CheckSquare,
  Wallet,
  Sprout,
  ShoppingBag,
  GitBranch,
  LogOut,
  Settings,
} from "lucide-react";
import Image from "next/image";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/tasks", label: "Tasks", icon: CheckSquare },
  { href: "/dashboard/wallet", label: "Wallet", icon: Wallet },
  { href: "/dashboard/farm", label: "Farm", icon: Sprout },
  { href: "/dashboard/shop", label: "Shop", icon: ShoppingBag },
  { href: "/dashboard/repos", label: "Repositories", icon: GitBranch },
  { href: "/dashboard/admin", label: "Admin", icon: Settings },
];

type User = {
  name?: string | null;
  email?: string | null;
  image?: string | null;
};

export function Sidebar({ user }: { user: User }) {
  const pathname = usePathname();

  return (
    <aside className="w-64 bg-card border-r border-border flex flex-col min-h-screen">
      <div className="p-6 border-b border-border">
        <Link href="/dashboard" className="flex items-center gap-2">
          <Sprout className="h-7 w-7 text-primary" />
          <span className="text-xl font-bold text-primary">FarmOps</span>
        </Link>
      </div>

      <nav className="flex-1 p-4 space-y-1">
        {navItems.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
              pathname === href
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        ))}
      </nav>

      <div className="p-4 border-t border-border">
        <div className="flex items-center gap-3 mb-3">
          {user.image && (
            <Image
              src={user.image}
              alt={user.name ?? "User"}
              width={32}
              height={32}
              className="rounded-full"
            />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{user.name}</p>
            <p className="text-xs text-muted-foreground truncate">{user.email}</p>
          </div>
        </div>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-destructive transition-colors w-full"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>
    </aside>
  );
}
