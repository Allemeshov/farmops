import { Task, TaskStatus, TaskType, SourceType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { labelToTaskType, getVerificationMode } from "@/lib/github";
import { loadScoringConfig, computeCoins, getFarmUpgradeMultiplier } from "@/lib/scoring";

type JobPayload = { eventId: string };

export async function processGithubEvent(payload: JobPayload): Promise<void> {
  const event = await prisma.event.findUnique({ where: { id: payload.eventId } });
  if (!event || event.processed) return;

  const body = event.payload as Record<string, unknown>;

  try {
    if (event.eventType === "issues") {
      await handleIssueEvent(body);
    } else if (event.eventType === "pull_request") {
      await handlePullRequestEvent(body);
    } else if (event.eventType === "check_suite" || event.eventType === "workflow_run") {
      await handleCiEvent(body, event.eventType);
    }

    await prisma.event.update({ where: { id: event.id }, data: { processed: true } });
  } catch (err) {
    console.error(`[process_github_event] Error processing event ${event.id}:`, err);
    throw err;
  }
}

async function handleIssueEvent(body: Record<string, unknown>): Promise<void> {
  const action = body.action as string;
  const issue = body.issue as Record<string, unknown>;
  const repo = body.repository as Record<string, unknown>;
  const installation = body.installation as Record<string, unknown> | undefined;

  if (!["labeled", "unlabeled", "closed", "reopened"].includes(action)) return;

  const repoRecord = await prisma.repository.findUnique({
    where: { githubRepoId: repo.id as number },
  });
  if (!repoRecord || !repoRecord.enabled) return;

  const labels = ((issue.labels as Array<{ name: string }>) ?? []).map((l) =>
    l.name.toLowerCase()
  );
  const taskType = getFirstTrackedTaskType(labels);

  if (action === "labeled" && taskType) {
    await upsertTask({
      orgId: repoRecord.orgId,
      repoId: repoRecord.id,
      sourceType: SourceType.ISSUE,
      githubNumber: issue.number as number,
      githubNodeId: issue.node_id as string,
      title: issue.title as string,
      url: issue.html_url as string,
      status: TaskStatus.OPEN,
      labels,
      taskType,
      openedAt: new Date(issue.created_at as string),
    });
  } else if (action === "closed") {
    await prisma.task.updateMany({
      where: {
        repoId: repoRecord.id,
        sourceType: SourceType.ISSUE,
        githubNumber: issue.number as number,
      },
      data: { status: TaskStatus.CANCELLED, closedAt: new Date() },
    });
  } else if (action === "reopened") {
    await prisma.task.updateMany({
      where: {
        repoId: repoRecord.id,
        sourceType: SourceType.ISSUE,
        githubNumber: issue.number as number,
      },
      data: { status: TaskStatus.OPEN, closedAt: null },
    });
  }
}

async function handlePullRequestEvent(body: Record<string, unknown>): Promise<void> {
  const action = body.action as string;
  const pr = body.pull_request as Record<string, unknown>;
  const repo = body.repository as Record<string, unknown>;

  if (!["opened", "labeled", "closed", "reopened"].includes(action)) return;

  const repoRecord = await prisma.repository.findUnique({
    where: { githubRepoId: repo.id as number },
  });
  if (!repoRecord || !repoRecord.enabled) return;

  const labels = ((pr.labels as Array<{ name: string }>) ?? []).map((l) => l.name.toLowerCase());
  const taskType = getFirstTrackedTaskType(labels);

  if ((action === "opened" || action === "labeled") && taskType) {
    await upsertTask({
      orgId: repoRecord.orgId,
      repoId: repoRecord.id,
      sourceType: SourceType.PULL_REQUEST,
      githubNumber: pr.number as number,
      githubNodeId: pr.node_id as string,
      title: pr.title as string,
      url: pr.html_url as string,
      status: TaskStatus.IN_PROGRESS,
      labels,
      taskType,
      openedAt: new Date(pr.created_at as string),
      locChanged: calculateLoc(pr),
    });
  } else if (action === "closed" && (pr.merged as boolean)) {
    const mergedAt = new Date(pr.merged_at as string);
    const task = await prisma.task.findFirst({
      where: {
        repoId: repoRecord.id,
        sourceType: SourceType.PULL_REQUEST,
        githubNumber: pr.number as number,
      },
    });
    if (!task) return;

    await prisma.task.update({
      where: { id: task.id },
      data: {
        prMerged: true,
        mergedAt,
        locChanged: calculateLoc(pr),
        status: TaskStatus.IN_PROGRESS,
      },
    });

    const verificationMode = getVerificationMode();
    if (verificationMode === "merge_only") {
      await verifyAndReward(task.id, repoRecord.orgId, pr);
    }
  } else if (action === "closed" && !(pr.merged as boolean)) {
    await prisma.task.updateMany({
      where: {
        repoId: repoRecord.id,
        sourceType: SourceType.PULL_REQUEST,
        githubNumber: pr.number as number,
      },
      data: { status: TaskStatus.CANCELLED, closedAt: new Date() },
    });
  }
}

async function handleCiEvent(
  body: Record<string, unknown>,
  eventType: string
): Promise<void> {
  const action = body.action as string;
  if (action !== "completed") return;

  const suite =
    eventType === "check_suite"
      ? (body.check_suite as Record<string, unknown>)
      : (body.workflow_run as Record<string, unknown>);

  const conclusion = suite.conclusion as string;
  if (conclusion !== "success") return;

  const repo = body.repository as Record<string, unknown>;
  const headSha = suite.head_sha as string;
  const headBranch = (suite.head_branch as string) ?? "";

  const repoRecord = await prisma.repository.findUnique({
    where: { githubRepoId: repo.id as number },
  });
  if (!repoRecord || !repoRecord.enabled) return;

  const task = await prisma.task.findFirst({
    where: {
      repoId: repoRecord.id,
      sourceType: SourceType.PULL_REQUEST,
      prMerged: true,
      ciPassed: false,
      status: { not: TaskStatus.DONE },
    },
    orderBy: { mergedAt: "desc" },
  });

  if (!task) return;

  await prisma.task.update({
    where: { id: task.id },
    data: { ciPassed: true },
  });

  await verifyAndReward(task.id, repoRecord.orgId, null);
}

async function verifyAndReward(
  taskId: string,
  orgId: string,
  prBody: Record<string, unknown> | null
): Promise<void> {
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task || task.status === TaskStatus.DONE) return;
  if (!task.prMerged) return;

  const verificationMode = getVerificationMode();
  if (verificationMode === "checks" && !task.ciPassed) return;

  const org = await prisma.organization.findUnique({ where: { id: orgId } });
  if (!org) return;

  const config = await loadScoringConfig();
  const upgradeMultiplier = await getFarmUpgradeMultiplier(orgId, task.taskType);

  const scoring = computeCoins({
    taskType: task.taskType,
    ciPassed: task.ciPassed,
    locChanged: task.locChanged,
    upgradeMultiplier,
    config,
    verificationMode,
  });

  const existingReward = await prisma.reward.findUnique({ where: { taskId } });
  if (existingReward) return;

  const orgMember = await prisma.orgMember.findFirst({ where: { orgId } });
  if (!orgMember) return;

  await prisma.$transaction(async (tx) => {
    await tx.task.update({
      where: { id: taskId },
      data: { status: TaskStatus.DONE, closedAt: new Date() },
    });

    await tx.reward.create({
      data: {
        taskId,
        userId: orgMember.userId,
        baseCoins: scoring.baseCoins,
        verificationMultiplier: scoring.verificationMultiplier,
        sizeMultiplier: scoring.sizeMultiplier,
        upgradeMultiplier: scoring.upgradeMultiplier,
        totalCoins: scoring.totalCoins,
      },
    });

    await tx.wallet.upsert({
      where: { userId: orgMember.userId },
      update: { balance: { increment: scoring.totalCoins } },
      create: { userId: orgMember.userId, balance: scoring.totalCoins },
    });

    let orgWallet = await tx.wallet.findUnique({ where: { orgId } });
    if (orgWallet) {
      await tx.wallet.update({
        where: { orgId },
        data: { balance: { increment: scoring.totalCoins } },
      });
    } else {
      await tx.wallet.create({ data: { orgId, balance: scoring.totalCoins } });
    }
  });

  console.log(
    `[reward] Task ${taskId} completed. Awarded ${scoring.totalCoins} coins to user ${orgMember.userId}`
  );
}

async function upsertTask(data: {
  orgId: string;
  repoId: string;
  sourceType: SourceType;
  githubNumber: number;
  githubNodeId: string;
  title: string;
  url: string;
  status: TaskStatus;
  labels: string[];
  taskType: TaskType;
  openedAt: Date;
  locChanged?: number;
}): Promise<Task> {
  return prisma.task.upsert({
    where: { githubNodeId: data.githubNodeId },
    update: {
      title: data.title,
      labels: data.labels,
      taskType: data.taskType,
      status: data.status,
    },
    create: {
      orgId: data.orgId,
      repoId: data.repoId,
      sourceType: data.sourceType,
      githubNumber: data.githubNumber,
      githubNodeId: data.githubNodeId,
      title: data.title,
      url: data.url,
      status: data.status,
      labels: data.labels,
      taskType: data.taskType,
      openedAt: data.openedAt,
      locChanged: data.locChanged,
    },
  });
}

function getFirstTrackedTaskType(labels: string[]): TaskType | null {
  for (const label of labels) {
    const type = labelToTaskType(label);
    if (type) return type as TaskType;
  }
  return null;
}

function calculateLoc(pr: Record<string, unknown>): number {
  const additions = (pr.additions as number) ?? 0;
  const deletions = (pr.deletions as number) ?? 0;
  return additions + deletions;
}
