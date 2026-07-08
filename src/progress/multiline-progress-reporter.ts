import type { PipelineProgressSnapshot } from "@core/types";
import type { ProgressReporter } from "./single-line-progress-reporter";

export class MultilineProgressReporter implements ProgressReporter {
  private lastPrintedLines = 0;
  private startTime = 0;
  private animationInterval: NodeJS.Timeout | null = null;
  private frameIndex = 0;
  private currentSnapshot: PipelineProgressSnapshot | null = null;
  private originalConsole: typeof console | null = null;

  constructor() {
    this.startTime = Date.now();
  }

  // Classic ASCII spinner frames: | / - \
  private static readonly SPINNER_FRAMES = ["|", "/", "-", "\\"];

  start(snapshot: PipelineProgressSnapshot): void {
    this.startTime = Date.now();
    this.currentSnapshot = snapshot;
    this.interceptConsole();
    this.startAnimationLoop();
    this.render();
  }

  update(snapshot: PipelineProgressSnapshot): void {
    this.currentSnapshot = snapshot;
    const isInteractive = process.stdout.isTTY && !process.env.CI;
    const cols = process.stdout.columns || 80;
    if (!isInteractive || cols < 80 || process.env.NODE_ENV === "test") {
      this.render();
    }
  }

  succeed(summary: string): void {
    this.stopAnimationLoop();
    this.restoreConsole();
    this.clearDashboard();
    console.log(`\x1b[32m[OK] ${summary}\x1b[0m`);
  }

  fail(message: string): void {
    this.stopAnimationLoop();
    this.restoreConsole();
    this.clearDashboard();
    console.log(`\x1b[31m[FAIL] ${message}\x1b[0m`);
  }

  private interceptConsole(): void {
    if (this.originalConsole) return;
    this.originalConsole = { ...console };

    const methods: Array<keyof typeof console> = ["log", "info", "warn", "error"];
    let isIntercepting = false;

    for (const method of methods) {
      const original = console[method] as (...args: unknown[]) => void;
      console[method] = ((...args: unknown[]) => {
        if (isIntercepting) {
          original.apply(console, args);
          return;
        }
        isIntercepting = true;
        try {
          this.clearDashboard();
          original.apply(console, args);
          this.render();
        } finally {
          isIntercepting = false;
        }
      }) as never;
    }
  }

  private restoreConsole(): void {
    if (!this.originalConsole) return;
    const methods: Array<keyof typeof console> = ["log", "info", "warn", "error"];
    for (const method of methods) {
      console[method] = this.originalConsole[method] as never;
    }
    this.originalConsole = null;
  }

  private startAnimationLoop(): void {
    const isInteractive = process.stdout.isTTY && !process.env.CI;
    const cols = process.stdout.columns || 80;
    if (!isInteractive || cols < 80 || this.animationInterval) return;
    this.animationInterval = setInterval(() => {
      this.frameIndex++;
      this.render(true);
    }, 80);
    this.animationInterval.unref?.();
  }

  private stopAnimationLoop(): void {
    if (this.animationInterval) {
      clearInterval(this.animationInterval);
      this.animationInterval = null;
    }
  }

  private clearDashboard(): void {
    const isInteractive = process.stdout.isTTY && !process.env.CI;
    if (isInteractive && this.lastPrintedLines > 0) {
      let clearSequence = "\r";
      for (let i = 0; i < this.lastPrintedLines; i++) {
        clearSequence += "\x1b[A\x1b[2K";
      }
      process.stdout.write(clearSequence);
      this.lastPrintedLines = 0;
    }
  }

  private render(isAnimationTick = false): void {
    if (!this.currentSnapshot) return;

    const isInteractive = process.stdout.isTTY && !process.env.CI;
    const cols = process.stdout.columns || 80;

    if (!isInteractive || cols < 80) {
      if (isAnimationTick) return;
      this.clearDashboard();
      // Non-interactive fallback: print clean single-line status updates periodically
      const completed =
        this.currentSnapshot.skipped +
        this.currentSnapshot.matched +
        this.currentSnapshot.rejected +
        this.currentSnapshot.failed;
      const discovered = this.currentSnapshot.discovered;
      const stage = this.currentSnapshot.stage;

      const logFn = this.originalConsole ? this.originalConsole.log : console.log;
      logFn(
        `[Stage: ${stage}] Processed ${completed}/${discovered} jobs (skipped: ${this.currentSnapshot.skipped}, matched: ${this.currentSnapshot.matched}, rejected: ${this.currentSnapshot.rejected}, failed: ${this.currentSnapshot.failed})`
      );
      this.lastPrintedLines = 0;
      return;
    }

    const snapshot = this.currentSnapshot;
    const spinner =
      MultilineProgressReporter.SPINNER_FRAMES[
        this.frameIndex % MultilineProgressReporter.SPINNER_FRAMES.length
      ];

    // Estimate Time Remaining (ETA) - excluding skipped jobs to prevent velocity calculation distortion
    const activeTotal = snapshot.discovered - snapshot.skipped;
    const activeCompleted = snapshot.matched + snapshot.rejected + snapshot.failed;
    const activeRemaining = Math.max(0, activeTotal - activeCompleted);
    const elapsedMs = Date.now() - this.startTime;

    let etaText = "estimating...";
    if (activeCompleted > 0) {
      const msPerJob = elapsedMs / activeCompleted;
      const etaSeconds = Math.round((msPerJob * activeRemaining) / 1000);
      etaText = `${etaSeconds}s`;
    } else if (activeRemaining === 0) {
      etaText = "0s";
    }

    const completed = snapshot.skipped + snapshot.matched + snapshot.rejected + snapshot.failed;

    // Progress Bar (compact width: 20 blocks)
    const barWidth = 20;
    const pct = snapshot.discovered > 0 ? completed / snapshot.discovered : 0;
    const filledWidth = Math.round(pct * barWidth);
    const emptyWidth = barWidth - filledWidth;
    const progressBar = `[${"=".repeat(filledWidth)}${".".repeat(emptyWidth)}]`;
    const pctText = `${Math.round(pct * 100)}%`;

    // Compact Metrics Line
    const queueSize =
      snapshot.queuedFetch + snapshot.queuedScore + snapshot.fetching + snapshot.scoring;
    const metricsLine = `Match: \x1b[32m${snapshot.matched}\x1b[0m | Reject: \x1b[31m${snapshot.rejected}\x1b[0m | Fail: \x1b[31;1m${snapshot.failed}\x1b[0m | Skip: \x1b[33m${snapshot.skipped}\x1b[0m | Queue: \x1b[35m${queueSize}\x1b[0m`;

    // Compact Active Processes Line
    const activeTasks: string[] = [];
    if (snapshot.activeFetchCompanies.length > 0) {
      const company = snapshot.activeFetchCompanies[0];
      const truncated = company.length > 12 ? `${company.slice(0, 9)}...` : company;
      activeTasks.push(`[Fetch] ${truncated}`);
    }
    if (snapshot.activeScoreCompanies.length > 0) {
      const company = snapshot.activeScoreCompanies[0];
      const truncated = company.length > 12 ? `${company.slice(0, 9)}...` : company;
      activeTasks.push(`[Score] ${truncated}`);
    }
    const activeContent = activeTasks.length > 0 ? `${activeTasks.join(" | ")}` : "idle";
    const activeLine = `Active: ${activeContent} [${spinner}]`;

    // Construct 3-line minimalist layout
    const lines = [
      `[${snapshot.stage}] ${progressBar} ${pctText} (${completed}/${snapshot.discovered}) | ETA: ${etaText}`,
      metricsLine,
      activeLine
    ];

    // Atomic Clear and Draw
    let output = "";
    if (this.lastPrintedLines > 0) {
      output += "\r";
      for (let i = 0; i < this.lastPrintedLines; i++) {
        output += "\x1b[A\x1b[2K";
      }
    }
    output += lines.join("\n") + "\n";
    process.stdout.write(output);
    this.lastPrintedLines = lines.length;
  }
}
