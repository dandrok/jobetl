import type { IncomingMessage, ServerResponse } from "node:http";

/** Injectable time source so tests can advance the clock without real waiting. */
export type Clock = () => number;

export const DEFAULT_BODY_LIMIT_BYTES = 65536;

const NO_STORE = "no-store, no-cache, must-revalidate, private";

/**
 * Single place that writes a JSON response. Every response carries `no-store`:
 * neither session state nor job data should ever be cached by a proxy.
 */
export function sendJson(
  res: ServerResponse,
  status: number,
  body: unknown,
  extraHeaders: Record<string, string> = {}
): void {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": NO_STORE,
    ...extraHeaders
  });
  res.end(JSON.stringify(body));
}

export function parseCookies(req: IncomingMessage): Record<string, string> {
  const list: Record<string, string> = {};
  const header = req.headers.cookie;
  if (!header) return list;

  for (const cookie of header.split(";")) {
    const parts = cookie.split("=");
    const key = parts.shift()?.trim();
    if (!key) continue;
    const raw = parts.join("=");
    try {
      list[key] = decodeURIComponent(raw);
    } catch {
      // Malformed percent-encoding must not take the server down.
      list[key] = raw;
    }
  }
  return list;
}

export type BodyResult<T> = { ok: true; value: T } | { ok: false };

/**
 * Reads a JSON body with a hard byte cap, responding 413/400 itself on failure.
 *
 * The cap is measured in bytes rather than JS string length: a string of N
 * characters can be up to 4N bytes once encoded, so counting characters lets a
 * multi-byte payload through at several times the intended limit.
 */
export function readJsonBody<T>(
  req: IncomingMessage,
  res: ServerResponse,
  limitBytes: number = DEFAULT_BODY_LIMIT_BYTES
): Promise<BodyResult<T>> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let aborted = false;

    req.on("data", (chunk: Buffer) => {
      if (aborted) return;
      size += chunk.byteLength;
      if (size > limitBytes) {
        aborted = true;
        sendJson(res, 413, { error: "Payload Too Large" });
        req.destroy();
        resolve({ ok: false });
        return;
      }
      chunks.push(chunk);
    });

    req.on("error", () => {
      if (aborted) return;
      aborted = true;
      resolve({ ok: false });
    });

    req.on("end", () => {
      if (aborted) return;
      try {
        resolve({ ok: true, value: JSON.parse(Buffer.concat(chunks).toString("utf8")) as T });
      } catch {
        sendJson(res, 400, { error: "Bad Request: Invalid JSON" });
        resolve({ ok: false });
      }
    });
  });
}

/**
 * Resolves the client IP for rate limiting.
 *
 * `x-forwarded-for` is only consulted when TRUST_PROXY is set, because on a
 * directly-exposed server any client can forge it and mint a fresh rate-limit
 * bucket per request. Even when trusted we prefer `x-real-ip`, which nginx sets
 * to `$remote_addr` as a single value. The last entry of `x-forwarded-for` is
 * the fallback: nginx *appends* the peer address, so the trustworthy hop is the
 * rightmost one, not the leftmost.
 */
export function clientIp(req: IncomingMessage, trustProxy: boolean): string {
  if (trustProxy) {
    const realIp = req.headers["x-real-ip"];
    if (typeof realIp === "string" && realIp.trim()) {
      return realIp.trim();
    }

    const forwarded = req.headers["x-forwarded-for"];
    const raw = Array.isArray(forwarded) ? forwarded.at(-1) : forwarded;
    const hops = raw
      ?.split(",")
      .map((hop) => hop.trim())
      .filter(Boolean);
    if (hops?.length) {
      return hops[hops.length - 1];
    }
  }

  return req.socket.remoteAddress || "unknown";
}
