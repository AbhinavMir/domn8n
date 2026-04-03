import { homedir } from "os";
import { join } from "path";
import { mkdir, readFile, writeFile } from "fs/promises";
import { existsSync } from "fs";
import inquirer from "inquirer";

const BASE_DIR = join(homedir(), ".domn8n");
const KEYS_DIR = join(BASE_DIR, "keys");
const SCRIPTS_DIR = join(BASE_DIR, "scripts");
const KEY_FILE = join(KEYS_DIR, "anthropic.key");

export { SCRIPTS_DIR };

export async function ensureDirs() {
  await mkdir(KEYS_DIR, { recursive: true });
  await mkdir(SCRIPTS_DIR, { recursive: true });
}

export async function getApiKey(): Promise<string> {
  await ensureDirs();

  if (existsSync(KEY_FILE)) {
    const key = (await readFile(KEY_FILE, "utf-8")).trim();
    if (key) return key;
  }

  const { key } = await inquirer.prompt([
    {
      type: "password",
      name: "key",
      message: "Claude API key (saved to ~/.domn8n/keys/)",
      mask: "*",
    },
  ]);

  await writeFile(KEY_FILE, key, { mode: 0o600 });
  return key;
}
