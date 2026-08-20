import type { IncomingMessage, ServerResponse } from "node:http";
import { readJsonBody, sendJson } from "@server/http";
import type { AppDeps } from "@server/app";

interface StatusPatchPayload {
  isApplied?: unknown;
  isNotInterested?: unknown;
}

export async function handleListJobs(res: ServerResponse, deps: AppDeps): Promise<void> {
  try {
    const jobs = await deps.repository.listJobs();
    sendJson(
      res,
      200,
      jobs.filter((job) => job.status === "matched" || job.status === "rejected")
    );
  } catch (error) {
    console.error("Failed to list jobs:", error);
    sendJson(res, 500, { error: "Internal Server Error" });
  }
}

export async function handlePatchJob(
  req: IncomingMessage,
  res: ServerResponse,
  rawId: string,
  deps: AppDeps
): Promise<void> {
  let id: string;
  try {
    id = decodeURIComponent(rawId);
  } catch {
    sendJson(res, 400, { error: "Bad Request" });
    return;
  }

  const body = await readJsonBody<StatusPatchPayload>(req, res);
  if (!body.ok) return;

  const { isApplied, isNotInterested } = body.value;

  // Reject a supplied-but-wrongly-typed field rather than silently ignoring it,
  // which would report success for an update that never happened.
  const malformed = [isApplied, isNotInterested].some(
    (value) => value !== undefined && typeof value !== "boolean"
  );
  const hasUpdate = typeof isApplied === "boolean" || typeof isNotInterested === "boolean";

  if (malformed || !hasUpdate) {
    sendJson(res, 400, { error: "Bad Request" });
    return;
  }

  try {
    let updated = false;
    if (typeof isApplied === "boolean") {
      updated = (await deps.repository.updateJobAppliedStatus(id, isApplied)) || updated;
    }
    if (typeof isNotInterested === "boolean") {
      updated = (await deps.repository.updateJobInterestedStatus(id, isNotInterested)) || updated;
    }

    if (updated) {
      sendJson(res, 200, { success: true });
    } else {
      sendJson(res, 404, { error: "Not found" });
    }
  } catch (error) {
    console.error("Failed to update job status in DB:", error);
    sendJson(res, 500, { error: "Internal Server Error" });
  }
}
