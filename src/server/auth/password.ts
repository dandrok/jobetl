import * as argon2 from "argon2";

/**
 * OWASP-minimum Argon2id parameters (m=19 MiB, t=2, p=1).
 *
 * The library defaults to m=65536 (64 MiB) with p=4. Since `argon2.verify()`
 * reads its cost parameters from the *stored digest*, these only take effect
 * once the hash is regenerated with `npm run hash:password` -- setting them on
 * the verify call would do nothing.
 */
export const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1
} as const;

export type VerifyOutcome = "valid" | "invalid" | "busy";

export interface PasswordVerifierOptions {
  maxConcurrent?: number;
  maxQueued?: number;
  verifyFn?: (hash: string, password: string) => Promise<boolean>;
}

/**
 * Verifies passwords, shedding load rather than queueing without bound.
 *
 * Note on memory: peak Argon2 memory is governed by UV_THREADPOOL_SIZE x
 * memoryCost, not by request volume -- the native binding runs on libuv's
 * threadpool, which already caps genuine concurrency (4 by default). Measured
 * at 50 concurrent requests: 4 x 64 MiB = ~258 MB, 4 x 19 MiB = ~77 MB. The
 * memory fix is therefore ARGON2_OPTIONS plus the pinned UV_THREADPOOL_SIZE in
 * ecosystem.config.cjs; this class does not lower that peak at default settings.
 *
 * What it does provide: a bounded queue, so a burst of login requests returns
 * 503 instead of accumulating pending work items indefinitely.
 */
export class PasswordVerifier {
  private readonly maxConcurrent: number;
  private readonly maxQueued: number;
  private readonly verifyFn: (hash: string, password: string) => Promise<boolean>;
  private active = 0;
  private readonly queue: Array<() => void> = [];

  constructor({
    maxConcurrent = 2,
    maxQueued = 8,
    verifyFn = (hash, password) => argon2.verify(hash, password)
  }: PasswordVerifierOptions = {}) {
    this.maxConcurrent = maxConcurrent;
    this.maxQueued = maxQueued;
    this.verifyFn = verifyFn;
  }

  async verify(hash: string, password: string): Promise<VerifyOutcome> {
    if (this.active >= this.maxConcurrent && this.queue.length >= this.maxQueued) {
      // Shed load rather than letting the queue grow without bound.
      return "busy";
    }

    await this.acquire();
    try {
      return (await this.verifyFn(hash, password)) ? "valid" : "invalid";
    } finally {
      this.release();
    }
  }

  private acquire(): Promise<void> {
    if (this.active < this.maxConcurrent) {
      this.active += 1;
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.queue.push(() => {
        this.active += 1;
        resolve();
      });
    });
  }

  private release(): void {
    this.active -= 1;
    this.queue.shift()?.();
  }
}

/**
 * True when the stored digest's Argon2 version, memoryCost, timeCost or
 * parallelism differ from ARGON2_OPTIONS in any direction.
 */
export function needsRehash(hash: string): boolean {
  try {
    return argon2.needsRehash(hash, ARGON2_OPTIONS);
  } catch {
    return false;
  }
}
