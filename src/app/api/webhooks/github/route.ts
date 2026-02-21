import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyWebhookSignature } from "@/lib/github";
import { addJob } from "@/lib/queue";

export const runtime = "nodejs";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const signature = req.headers.get("x-hub-signature-256");
  const deliveryId = req.headers.get("x-github-delivery");
  const eventType = req.headers.get("x-github-event");

  if (!deliveryId || !eventType) {
    return NextResponse.json({ error: "Missing headers" }, { status: 400 });
  }

  const rawBody = await req.text();
  const secret = process.env.GITHUB_WEBHOOK_SECRET ?? "";

  if (!verifyWebhookSignature(rawBody, signature, secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const existing = await prisma.event.findUnique({ where: { deliveryId } });
  if (existing) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  const event = await prisma.event.create({
    data: {
      deliveryId,
      eventType,
      payload: payload as object,
    },
  });

  await addJob("process_github_event", { eventId: event.id });

  return NextResponse.json({ ok: true });
}
