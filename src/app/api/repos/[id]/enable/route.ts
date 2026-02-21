import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json() as { enabled: boolean };

  const repo = await prisma.repository.findUnique({ where: { id } });
  if (!repo) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const membership = await prisma.orgMember.findFirst({
    where: { userId: session.user.id, orgId: repo.orgId },
  });
  if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const updated = await prisma.repository.update({
    where: { id },
    data: { enabled: body.enabled },
  });

  return NextResponse.json(updated);
}
