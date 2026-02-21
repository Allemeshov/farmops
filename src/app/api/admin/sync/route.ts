import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { addJob } from "@/lib/queue";

export async function POST(): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const membership = await prisma.orgMember.findFirst({
    where: { userId: session.user.id, role: "OWNER" },
  });
  if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await addJob("sync_repos");
  return NextResponse.json({ ok: true });
}
