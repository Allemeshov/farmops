"use client";

import { signIn } from "next-auth/react";
import { Github, Sprout, FlaskConical } from "lucide-react";

const isDev = process.env.NODE_ENV === "development";

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-yellow-50">
      <div className="bg-white rounded-2xl shadow-xl p-10 flex flex-col items-center gap-6 max-w-sm w-full">
        <div className="flex items-center gap-3">
          <Sprout className="h-10 w-10 text-green-500" />
          <span className="text-3xl font-bold text-green-700">FarmOps</span>
        </div>
        <p className="text-center text-muted-foreground text-sm">
          Gamify your DevOps and SRE maintenance work. Earn coins for every merged PR and
          reliability fix.
        </p>
        <button
          onClick={() => signIn("github", { callbackUrl: "/dashboard" })}
          className="flex items-center gap-3 bg-gray-900 text-white px-6 py-3 rounded-xl font-semibold hover:bg-gray-700 transition w-full justify-center"
        >
          <Github className="h-5 w-5" />
          Sign in with GitHub
        </button>
        {isDev && (
          <div className="w-full space-y-2">
            <div className="flex items-center gap-2">
              <div className="flex-1 h-px bg-border" />
              <span className="text-xs text-muted-foreground">dev only</span>
              <div className="flex-1 h-px bg-border" />
            </div>
            <button
              onClick={() => signIn("credentials", { callbackUrl: "/dashboard" })}
              className="flex items-center gap-3 bg-amber-500 text-white px-6 py-3 rounded-xl font-semibold hover:bg-amber-400 transition w-full justify-center"
            >
              <FlaskConical className="h-5 w-5" />
              Dev Login (no GitHub)
            </button>
            <p className="text-xs text-amber-700 text-center bg-amber-50 rounded-lg px-3 py-2">
              Uses seeded dev user. Run <code className="font-mono">npm run db:seed</code> first.
            </p>
          </div>
        )}
        <p className="text-xs text-muted-foreground text-center">
          Open-source · Self-hosted · Kubernetes-native
        </p>
      </div>
    </div>
  );
}
