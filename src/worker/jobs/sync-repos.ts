import { prisma } from "@/lib/prisma";
import { getGithubApp } from "@/lib/github";

export async function syncRepos(): Promise<void> {
  const installations = await prisma.githubInstallation.findMany({
    include: { org: true },
  });

  const app = getGithubApp();

  for (const installation of installations) {
    try {
      const octokit = await app.getInstallationOctokit(installation.installationId);

      const { data } = await octokit.request("GET /installation/repositories", {
        per_page: 100,
      });

      for (const repo of data.repositories) {
        await prisma.repository.upsert({
          where: { githubRepoId: repo.id },
          update: {
            name: repo.name,
            fullName: repo.full_name,
            private: repo.private,
            defaultBranch: repo.default_branch,
          },
          create: {
            githubRepoId: repo.id,
            orgId: installation.orgId,
            name: repo.name,
            fullName: repo.full_name,
            private: repo.private,
            defaultBranch: repo.default_branch,
            enabled: false,
          },
        });
      }

      console.log(
        `[sync_repos] Synced ${data.repositories.length} repos for org ${installation.org.login}`
      );
    } catch (err) {
      console.error(
        `[sync_repos] Failed for installation ${installation.installationId}:`,
        err
      );
    }
  }
}
