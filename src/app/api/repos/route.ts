import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const memberships = await prisma.orgMember.findMany({
    where: { userId: session.user.id },
    select: { orgId: true },
  });
  const orgIds = memberships.map((m) => m.orgId);

  const repos = await prisma.repository.findMany({
    where: { orgId: { in: orgIds } },
    orderBy: { fullName: "asc" },
  });

  return NextResponse.json(repos);
}
