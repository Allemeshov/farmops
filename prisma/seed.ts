import { PrismaClient, TaskType, TaskStatus, SourceType, OrgRole } from "@prisma/client";

const prisma = new PrismaClient();

async function seedDevData() {
  if (process.env.NODE_ENV === "production") return;

  console.log("Seeding dev data…");

  const user = await prisma.user.upsert({
    where: { email: "dev@farmops.local" },
    update: {},
    create: {
      name: "Dev Farmer",
      email: "dev@farmops.local",
      image: "https://avatars.githubusercontent.com/u/0",
      githubLogin: "dev-farmer",
      githubId: 999999,
    },
  });

  const org = await prisma.organization.upsert({
    where: { githubOrgId: 888888 },
    update: {},
    create: {
      githubOrgId: 888888,
      login: "dev-org",
      name: "Dev Organization",
      avatarUrl: "https://avatars.githubusercontent.com/u/0",
    },
  });

  await prisma.orgMember.upsert({
    where: { userId_orgId: { userId: user.id, orgId: org.id } },
    update: {},
    create: { userId: user.id, orgId: org.id, role: OrgRole.OWNER },
  });

  const repo1 = await prisma.repository.upsert({
    where: { fullName: "dev-org/platform" },
    update: {},
    create: {
      githubRepoId: 111001,
      orgId: org.id,
      name: "platform",
      fullName: "dev-org/platform",
      private: false,
      enabled: true,
      defaultBranch: "main",
    },
  });

  const repo2 = await prisma.repository.upsert({
    where: { fullName: "dev-org/infra" },
    update: {},
    create: {
      githubRepoId: 111002,
      orgId: org.id,
      name: "infra",
      fullName: "dev-org/infra",
      private: true,
      enabled: true,
      defaultBranch: "main",
    },
  });

  await prisma.repository.upsert({
    where: { fullName: "dev-org/docs" },
    update: {},
    create: {
      githubRepoId: 111003,
      orgId: org.id,
      name: "docs",
      fullName: "dev-org/docs",
      private: false,
      enabled: false,
      defaultBranch: "main",
    },
  });

  const taskDefs = [
    {
      repo: repo1,
      num: 42,
      nodeId: "PR_dev_001",
      title: "chore: upgrade Node.js to 20 LTS",
      url: "https://github.com/dev-org/platform/pull/42",
      type: TaskType.MAINTENANCE,
      status: TaskStatus.DONE,
      source: SourceType.PULL_REQUEST,
      prMerged: true,
      ciPassed: true,
      loc: 80,
      base: 10,
      verifyMult: 1.25,
      sizeMult: 1.0,
      upgradeMult: 1.0,
    },
    {
      repo: repo1,
      num: 55,
      nodeId: "PR_dev_002",
      title: "fix: remove manual alert silencing toil",
      url: "https://github.com/dev-org/platform/pull/55",
      type: TaskType.TOIL,
      status: TaskStatus.DONE,
      source: SourceType.PULL_REQUEST,
      prMerged: true,
      ciPassed: true,
      loc: 210,
      base: 15,
      verifyMult: 1.25,
      sizeMult: 1.1,
      upgradeMult: 1.0,
    },
    {
      repo: repo2,
      num: 7,
      nodeId: "PR_dev_003",
      title: "feat: add automated backup verification",
      url: "https://github.com/dev-org/infra/pull/7",
      type: TaskType.RELIABILITY,
      status: TaskStatus.DONE,
      source: SourceType.PULL_REQUEST,
      prMerged: true,
      ciPassed: true,
      loc: 620,
      base: 20,
      verifyMult: 1.25,
      sizeMult: 1.2,
      upgradeMult: 1.0,
    },
    {
      repo: repo2,
      num: 12,
      nodeId: "PR_dev_004",
      title: "security: rotate leaked API keys in CI",
      url: "https://github.com/dev-org/infra/pull/12",
      type: TaskType.SECURITY,
      status: TaskStatus.DONE,
      source: SourceType.PULL_REQUEST,
      prMerged: true,
      ciPassed: false,
      loc: 45,
      base: 25,
      verifyMult: 1.0,
      sizeMult: 1.0,
      upgradeMult: 1.0,
    },
    {
      repo: repo1,
      num: 68,
      nodeId: "ISSUE_dev_005",
      title: "maintenance: update deprecated Kubernetes API versions",
      url: "https://github.com/dev-org/platform/issues/68",
      type: TaskType.MAINTENANCE,
      status: TaskStatus.IN_PROGRESS,
      source: SourceType.ISSUE,
      prMerged: false,
      ciPassed: false,
      loc: null,
      base: 0,
      verifyMult: 1.0,
      sizeMult: 1.0,
      upgradeMult: 1.0,
    },
    {
      repo: repo2,
      num: 20,
      nodeId: "ISSUE_dev_006",
      title: "toil: automate certificate renewal for internal services",
      url: "https://github.com/dev-org/infra/issues/20",
      type: TaskType.TOIL,
      status: TaskStatus.OPEN,
      source: SourceType.ISSUE,
      prMerged: false,
      ciPassed: false,
      loc: null,
      base: 0,
      verifyMult: 1.0,
      sizeMult: 1.0,
      upgradeMult: 1.0,
    },
  ];

  let totalCoins = 0;
  for (const t of taskDefs) {
    const task = await prisma.task.upsert({
      where: { githubNodeId: t.nodeId },
      update: {},
      create: {
        orgId: org.id,
        repoId: t.repo.id,
        sourceType: t.source,
        githubNumber: t.num,
        githubNodeId: t.nodeId,
        title: t.title,
        url: t.url,
        status: t.status,
        labels: [t.type.toLowerCase()],
        taskType: t.type,
        prMerged: t.prMerged,
        ciPassed: t.ciPassed,
        locChanged: t.loc,
        openedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        closedAt: t.status === TaskStatus.DONE ? new Date() : null,
        mergedAt: t.prMerged ? new Date() : null,
      },
    });

    if (t.status === TaskStatus.DONE && t.base > 0) {
      const coins = Math.round(t.base * t.verifyMult * t.sizeMult * t.upgradeMult);
      totalCoins += coins;
      await prisma.reward.upsert({
        where: { taskId: task.id },
        update: {},
        create: {
          taskId: task.id,
          userId: user.id,
          baseCoins: t.base,
          verificationMultiplier: t.verifyMult,
          sizeMultiplier: t.sizeMult,
          upgradeMultiplier: t.upgradeMult,
          totalCoins: coins,
        },
      });
    }
  }

  await prisma.wallet.upsert({
    where: { userId: user.id },
    update: { balance: totalCoins },
    create: { userId: user.id, balance: totalCoins },
  });

  const orgWallet = await prisma.wallet.upsert({
    where: { orgId: org.id },
    update: { balance: totalCoins },
    create: { orgId: org.id, balance: totalCoins },
  });

  const farm = await prisma.farm.upsert({
    where: { orgId: org.id },
    update: {},
    create: { orgId: org.id, name: "Dev Farm" },
  });

  const ciWindmill = await prisma.shopItem.findUnique({ where: { slug: "ci-windmill" } });
  if (ciWindmill) {
    await prisma.farmUpgrade.upsert({
      where: { farmId_shopItemId: { farmId: farm.id, shopItemId: ciWindmill.id } },
      update: {},
      create: { farmId: farm.id, shopItemId: ciWindmill.id, level: 1 },
    });
    await prisma.purchase.create({
      data: {
        walletId: orgWallet.id,
        orgId: org.id,
        shopItemId: ciWindmill.id,
        level: 1,
        cost: ciWindmill.baseCost,
      },
    });
  }

  console.log(`Dev data seeded. User wallet: ${totalCoins} coins.`);
}

async function main() {
  const shopItems = [
    {
      slug: "auto-patch-shed",
      name: "Auto-Patch Shed",
      description: "Boosts rewards for maintenance tasks.",
      icon: "🛖",
      baseCost: 100,
      maxLevel: 3,
      multiplier: 1.15,
      taskType: TaskType.MAINTENANCE,
    },
    {
      slug: "runbook-barn",
      name: "Runbook Barn",
      description: "Boosts rewards for documentation and toil tasks.",
      icon: "🏚️",
      baseCost: 120,
      maxLevel: 3,
      multiplier: 1.15,
      taskType: TaskType.TOIL,
    },
    {
      slug: "alert-scarecrow",
      name: "Alert Scarecrow",
      description: "Boosts rewards for toil and alert cleanup tasks.",
      icon: "🧹",
      baseCost: 150,
      maxLevel: 3,
      multiplier: 1.2,
      taskType: TaskType.TOIL,
    },
    {
      slug: "backup-well",
      name: "Backup Well",
      description: "Boosts rewards for reliability tasks.",
      icon: "🪣",
      baseCost: 200,
      maxLevel: 3,
      multiplier: 1.2,
      taskType: TaskType.RELIABILITY,
    },
    {
      slug: "ci-windmill",
      name: "CI Windmill",
      description: "Boosts rewards when CI checks pass.",
      icon: "🌀",
      baseCost: 180,
      maxLevel: 3,
      multiplier: 1.25,
      taskType: null,
    },
    {
      slug: "security-fence",
      name: "Security Fence",
      description: "Boosts rewards for security tasks.",
      icon: "🔒",
      baseCost: 250,
      maxLevel: 3,
      multiplier: 1.25,
      taskType: TaskType.SECURITY,
    },
  ];

  for (const item of shopItems) {
    await prisma.shopItem.upsert({
      where: { slug: item.slug },
      update: item,
      create: item,
    });
  }

  const configs = [
    { key: "base_coins_maintenance", value: "10" },
    { key: "base_coins_toil", value: "15" },
    { key: "base_coins_reliability", value: "20" },
    { key: "base_coins_security", value: "25" },
    { key: "verification_multiplier_checks", value: "1.25" },
    { key: "verification_multiplier_merge_only", value: "1.0" },
    { key: "size_multiplier_small", value: "1.0" },
    { key: "size_multiplier_medium", value: "1.1" },
    { key: "size_multiplier_large", value: "1.2" },
    { key: "size_threshold_medium", value: "100" },
    { key: "size_threshold_large", value: "500" },
  ];

  for (const cfg of configs) {
    await prisma.config.upsert({
      where: { key: cfg.key },
      update: { value: cfg.value },
      create: cfg,
    });
  }

  console.log("Seed complete.");
  await seedDevData();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
