import * as argon2 from "argon2";
import { ARGON2_OPTIONS } from "@server/auth/password";

const CTRL_C = String.fromCharCode(3);
const CTRL_D = String.fromCharCode(4);
const ERASE = new Set([String.fromCharCode(127), String.fromCharCode(8)]);

/**
 * Prompts for a password without echoing it.
 *
 * Read from stdin rather than argv: command-line arguments land in shell
 * history and are visible to any local user via `ps`.
 */
function readPassword(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const input = process.stdin;
    const output = process.stdout;
    let buffer = "";

    const cleanup = () => {
      input.off("data", onData);
      if (input.isTTY) input.setRawMode(false);
      input.pause();
      output.write("\n");
    };

    const onData = (chunk: string) => {
      for (const char of chunk) {
        if (char === "\n" || char === "\r" || char === CTRL_D) {
          cleanup();
          resolve(buffer);
          return;
        }
        if (char === CTRL_C) {
          cleanup();
          reject(new Error("Aborted"));
          return;
        }
        if (ERASE.has(char)) {
          buffer = buffer.slice(0, -1);
          continue;
        }
        buffer += char;
      }
    };

    output.write(prompt);
    // Raw mode stops the terminal echoing keystrokes; piped input has no TTY
    // and needs no suppression.
    if (input.isTTY) input.setRawMode(true);
    input.setEncoding("utf8");
    input.resume();
    input.on("data", onData);
  });
}

async function run() {
  const password = (await readPassword("Dashboard password: ")).trim();

  if (password.length < 12) {
    console.error("Password must be at least 12 characters.");
    process.exit(1);
  }

  const hash = await argon2.hash(password, ARGON2_OPTIONS);
  const { memoryCost, timeCost, parallelism } = ARGON2_OPTIONS;

  console.log(`Argon2id - m=${memoryCost} KiB, t=${timeCost}, p=${parallelism}`);
  console.log("\nAdd this line to .env (single quotes matter - the hash contains $):\n");
  console.log(`DASHBOARD_PASSWORD_HASH='${hash}'\n`);
}

run().catch((error) => {
  console.error("Failed to generate hash:", error);
  process.exit(1);
});
