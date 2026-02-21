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
    include: { org: true },
  });

  return NextResponse.json(memberships.map((m) => ({ ...m.org, role: m.role })));
}
