import * as argon2 from "argon2";
import { ARGON2_OPTIONS } from "@server/auth/password";

const CTRL_C = String.fromCharCode(3);
const CTRL_D = String.fromCharCode(4);
const ERASE = new Set([String.fromCharCode(127), String.fromCharCode(8)]);

// Input can arrive faster than it is consumed -- piped stdin delivers every
// line in a single chunk -- so leftovers persist between prompts.
let buffered = "";

function applyErase(line: string): string {
  let out = "";
  for (const char of line) {
    if (ERASE.has(char)) {
      out = out.slice(0, -1);
    } else {
      out += char;
    }
  }
  return out;
}

/** Pulls one complete line out of the buffer, or null if none has arrived yet. */
function takeLine(): string | null {
  let end = -1;
  for (let i = 0; i < buffered.length; i += 1) {
    const char = buffered[i];
    if (char === "\n" || char === "\r" || char === CTRL_D) {
      end = i;
      break;
    }
  }
  if (end === -1) return null;

  const line = buffered.slice(0, end);
  let next = end + 1;
  if (buffered[end] === "\r" && buffered[next] === "\n") next += 1;
  buffered = buffered.slice(next);
  return applyErase(line);
}

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

    output.write(prompt);

    const ready = takeLine();
    if (ready !== null) {
      output.write("\n");
      resolve(ready);
      return;
    }

    const cleanup = () => {
      input.off("data", onData);
      input.off("end", onEnd);
      if (input.isTTY) input.setRawMode(false);
      input.pause();
      output.write("\n");
    };

    const onData = (chunk: string) => {
      if (chunk.includes(CTRL_C)) {
        cleanup();
        reject(new Error("Aborted"));
        return;
      }
      buffered += chunk;
      const line = takeLine();
      if (line !== null) {
        cleanup();
        resolve(line);
      }
    };

    // Input closed without a trailing newline.
    const onEnd = () => {
      const rest = applyErase(buffered);
      buffered = "";
      cleanup();
      resolve(rest);
    };

    // Raw mode stops the terminal echoing keystrokes; piped input has no TTY
    // and needs no suppression.
    if (input.isTTY) input.setRawMode(true);
    input.setEncoding("utf8");
    input.resume();
    input.on("data", onData);
    input.on("end", onEnd);
  });
}

async function run() {
  // Never trim: the login endpoint hashes exactly what the client sends, so
  // normalising here would produce a digest the real password cannot match.
  const password = await readPassword("Dashboard password: ");

  if (password.length < 12) {
    console.error("Password must be at least 12 characters.");
    process.exit(1);
  }

  // Input is not echoed, so a typo would otherwise yield a hash for a password
  // nobody knows.
  if ((await readPassword("Confirm password:    ")) !== password) {
    console.error("Passwords do not match.");
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
