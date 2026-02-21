import { run, parseCronItems } from "graphile-worker";
import { processGithubEvent } from "./jobs/process-github-event";
import { syncRepos } from "./jobs/sync-repos";
import { recomputeWallet } from "./jobs/recompute-wallet";

async function main() {
  const runner = await run({
    connectionString: process.env.DATABASE_URL!,
    concurrency: 5,
    noHandleSignals: false,
    pollInterval: 1000,
    taskList: {
      process_github_event: async (payload) => {
        await processGithubEvent(payload as { eventId: string });
      },
      sync_repos: async () => {
        await syncRepos();
      },
      recompute_wallet: async () => {
        await recomputeWallet();
      },
    },
    parsedCronItems: parseCronItems([
      { task: "sync_repos", match: "0 */6 * * *", options: { maxAttempts: 3, backfillPeriod: 0 } },
      { task: "recompute_wallet", match: "0 2 * * *", options: { maxAttempts: 3, backfillPeriod: 0 } },
    ]),
  });

  await runner.promise;
}

main().catch((err) => {
  console.error("Worker fatal error:", err);
  process.exit(1);
});
