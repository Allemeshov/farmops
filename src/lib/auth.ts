import NextAuth, { type NextAuthConfig } from "next-auth";
import GitHub from "next-auth/providers/github";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";

const DEV_USER_EMAIL = "dev@farmops.local";

const providers: NextAuthConfig["providers"] = [
  GitHub({
    clientId: process.env.GITHUB_CLIENT_ID ?? "dev",
    clientSecret: process.env.GITHUB_CLIENT_SECRET ?? "dev",
    profile(profile) {
      return {
        id: String(profile.id),
        name: profile.name ?? profile.login,
        email: profile.email,
        image: profile.avatar_url,
        githubId: profile.id,
        githubLogin: profile.login,
      };
    },
  }),
];

if (process.env.NODE_ENV === "development") {
  providers.push(
    Credentials({
      name: "Dev Login (no GitHub needed)",
      credentials: {},
      async authorize() {
        const user = await prisma.user.findUnique({
          where: { email: DEV_USER_EMAIL },
        });
        if (!user) {
          throw new Error(
            "Dev user not found. Run: npm run db:seed to create it."
          );
        }
        return { id: user.id, name: user.name, email: user.email, image: user.image };
      },
    })
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers,
  session: {
    strategy: process.env.NODE_ENV === "development" ? "jwt" : "database",
  },
  callbacks: {
    session({ session, user, token }) {
      if (user) {
        session.user.id = user.id;
      } else if (token?.sub) {
        session.user.id = token.sub;
      }
      return session;
    },
    jwt({ token, user }) {
      if (user) token.sub = user.id;
      return token;
    },
  },
  pages: {
    signIn: "/login",
  },
});
