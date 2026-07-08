import { formatPipelineProgressText } from "@progress/formatters";
import type { PipelineProgressSnapshot } from "@core/types";

export interface ProgressReporter {
  start(snapshot: PipelineProgressSnapshot): void;
  update(snapshot: PipelineProgressSnapshot): void;
  succeed(summary: string): void;
  fail(message: string): void;
}

export class SingleLineProgressReporter implements ProgressReporter {
  private lastTextLength = 0;
  private startTime = 0;
  private animationInterval: NodeJS.Timeout | null = null;
  private frameIndex = 0;
  private currentSnapshot: PipelineProgressSnapshot | null = null;

  constructor() {
    this.startTime = Date.now();
  }

  // Classic ASCII spinner frames: | / - \
  private static readonly SPINNER_FRAMES = ["|", "/", "-", "\\"];

  start(snapshot: PipelineProgressSnapshot): void {
    this.startTime = Date.now();
    this.currentSnapshot = snapshot;
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
    this.clearLine();
    console.log(`\x1b[32m[OK] ${summary}\x1b[0m`);
  }

  fail(message: string): void {
    this.stopAnimationLoop();
    this.clearLine();
    console.log(`\x1b[31m[FAIL] ${message}\x1b[0m`);
  }

  private startAnimationLoop(): void {
    const isInteractive = process.stdout.isTTY && !process.env.CI;
    if (!isInteractive || this.animationInterval) return;
    this.animationInterval = setInterval(() => {
      this.frameIndex++;
      this.render();
    }, 80);
    this.animationInterval.unref?.();
  }

  private stopAnimationLoop(): void {
    if (this.animationInterval) {
      clearInterval(this.animationInterval);
      this.animationInterval = null;
    }
  }

  private clearLine(): void {
    const isInteractive = process.stdout.isTTY && !process.env.CI;
    if (isInteractive && this.lastTextLength > 0) {
      process.stdout.write("\r\x1b[2K");
      this.lastTextLength = 0;
    }
  }

  private render(): void {
    if (!this.currentSnapshot) return;

    const isInteractive = process.stdout.isTTY && !process.env.CI;
    const baseText = formatPipelineProgressText(this.currentSnapshot);

    if (!isInteractive) {
      console.log(baseText);
      return;
    }

    const spinner =
      SingleLineProgressReporter.SPINNER_FRAMES[
        this.frameIndex % SingleLineProgressReporter.SPINNER_FRAMES.length
      ];

    const outputText = `\r\x1b[2K${spinner} ${baseText}`;
    process.stdout.write(outputText);
    this.lastTextLength = outputText.length;
  }
}
