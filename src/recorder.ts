import { writeFile } from "fs/promises";
import { join } from "path";
import { SCRIPTS_DIR } from "./config.js";
import { RecordedStep } from "./types.js";

export class Recorder {
  private steps: RecordedStep[] = [];
  private envVars: Map<string, string> = new Map();
  private envVarCounter = 0;

  record(step: RecordedStep) {
    this.steps.push(step);
  }

  addEnvVar(label: string): string {
    const name = `DOMN8N_${label.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`;
    this.envVars.set(name, label);
    this.envVarCounter++;
    return name;
  }

  async generate(name: string): Promise<string> {
    const fileName = `${name}.ts`;
    const filePath = join(SCRIPTS_DIR, fileName);
    const code = this.buildScript();
    await writeFile(filePath, code);
    return filePath;
  }

  private buildScript(): string {
    const envChecks = Array.from(this.envVars.entries())
      .map(([key, label]) => `  const ${varName(key)} = process.env.${key};\n  if (!${varName(key)}) throw new Error("Missing env var ${key} (${label})");`)
      .join("\n");

    const steps = this.steps
      .filter((s) => s.action.type !== "goal_reached" && s.action.type !== "ask_user")
      .map((s) => this.stepToCode(s))
      .join("\n\n");

    return `import { chromium } from "playwright";

async function run() {
${envChecks}

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
${steps}

    console.log("Done!");
  } finally {
    await browser.close();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
`;
  }

  private stepToCode(step: RecordedStep): string {
    const { action } = step;
    const indent = "    ";
    const comment = `${indent}// ${action.description}`;

    switch (action.type) {
      case "click":
        return `${comment}\n${indent}await page.click(${JSON.stringify(action.selector)});`;

      case "fill": {
        if (step.action.sensitive && step.userValue) {
          // Find the env var for this field
          const envKey = Array.from(this.envVars.entries())
            .find(([, label]) => label === action.label)?.[0];
          if (envKey) {
            return `${comment}\n${indent}await page.fill(${JSON.stringify(action.selector)}, ${varName(envKey)});`;
          }
        }
        const val = action.value || step.userValue || "";
        return `${comment}\n${indent}await page.fill(${JSON.stringify(action.selector)}, ${JSON.stringify(val)});`;
      }

      case "select":
        return `${comment}\n${indent}await page.selectOption(${JSON.stringify(action.selector)}, ${JSON.stringify(action.value)});`;

      case "navigate":
        return `${comment}\n${indent}await page.goto(${JSON.stringify(action.url)});`;

      case "wait":
        return `${comment}\n${indent}await page.waitForLoadState("networkidle");`;

      default:
        return `${indent}// Unknown action: ${action.type}`;
    }
  }
}

function varName(envKey: string): string {
  return envKey.toLowerCase().replace(/^domn8n_/, "");
}
