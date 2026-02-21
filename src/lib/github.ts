import { createHmac, timingSafeEqual } from "crypto";
import { App } from "@octokit/app";

export function verifyWebhookSignature(
  payload: string,
  signature: string | null,
  secret: string
): boolean {
  if (!signature) return false;
  const sig = Buffer.from(signature, "utf8");
  const digest = Buffer.from(
    "sha256=" + createHmac("sha256", secret).update(payload).digest("hex"),
    "utf8"
  );
  if (sig.length !== digest.length) return false;
  return timingSafeEqual(sig, digest);
}

export function getTrackedLabels(): string[] {
  const raw = process.env.FARMOPS_LABELS ?? "maintenance,toil,reliability,security";
  return raw.split(",").map((l) => l.trim().toLowerCase());
}

export function getVerificationMode(): "checks" | "merge_only" {
  return process.env.FARMOPS_VERIFICATION_MODE === "merge_only" ? "merge_only" : "checks";
}

export function labelToTaskType(label: string): string | null {
  const map: Record<string, string> = {
    maintenance: "MAINTENANCE",
    toil: "TOIL",
    reliability: "RELIABILITY",
    security: "SECURITY",
  };
  return map[label.toLowerCase()] ?? null;
}

export function getGithubApp(): App {
  const privateKey = (process.env.GITHUB_PRIVATE_KEY ?? "").replace(/\\n/g, "\n");
  return new App({
    appId: process.env.GITHUB_APP_ID!,
    privateKey,
    webhooks: { secret: process.env.GITHUB_WEBHOOK_SECRET! },
  });
}
