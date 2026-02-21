import { makeWorkerUtils } from "graphile-worker";

let workerUtilsPromise: ReturnType<typeof makeWorkerUtils> | null = null;

function getWorkerUtils() {
  if (!workerUtilsPromise) {
    workerUtilsPromise = makeWorkerUtils({
      connectionString: process.env.DATABASE_URL!,
    });
  }
  return workerUtilsPromise;
}

export async function addJob(
  taskIdentifier: string,
  payload?: Record<string, unknown>
): Promise<void> {
  const utils = await getWorkerUtils();
  await utils.addJob(taskIdentifier, payload);
}
