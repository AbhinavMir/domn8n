#!/usr/bin/env node

import { chromium } from "playwright";
import { getApiKey, ensureDirs } from "./config.js";
import { initPilot, decideAction } from "./pilot.js";
import { snapshot, attachNetworkLogger, getNetworkLog } from "./explorer.js";
import { Recorder } from "./recorder.js";
import { Action, RecordedStep } from "./types.js";

const MAX_RETRIES = 3;
const MAX_STEPS = 50;

async function main() {
  const args = parseArgs();
  if (!args.url || !args.goal) {
    console.log("Usage: domn8n --url <url> --goal <goal>");
    process.exit(1);
  }

  await ensureDirs();
  const apiKey = await getApiKey();
  initPilot(apiKey);

  console.log(`\nTarget: ${args.url}`);
  console.log(`Goal: ${args.goal}\n`);

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();
  attachNetworkLogger(page);

  const recorder = new Recorder();
  const history: string[] = [];
  let stepCount = 0;

  try {
    await page.goto(args.url, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1000);

    while (stepCount < MAX_STEPS) {
      const snap = await snapshot(page);
      const networkLog = getNetworkLog();

      let action: Action | null = null;
      let lastError: string | undefined;

      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
          action = await decideAction(args.goal, snap, networkLog, history, lastError);
          console.log(`  → ${action.description}`);

          if (action.type === "goal_reached") {
            console.log("\n  Goal reached!");
            break;
          }

          if (action.type === "ask_user") {
            const userValue = await promptUser(action.label || "Input needed", action.sensitive || false);

            // If this was a prompt for a form field, fill it
            if (action.selector) {
              await page.fill(action.selector, userValue);
              const fillAction: Action = {
                type: "fill",
                selector: action.selector,
                label: action.label,
                sensitive: action.sensitive,
                description: `Fill ${action.label || "field"}`,
              };
              const step: RecordedStep = {
                action: fillAction,
                url: snap.url,
                timestamp: Date.now(),
                userValue,
              };
              if (action.sensitive) {
                const envVar = recorder.addEnvVar(action.label || `secret_${stepCount}`);
                step.action.sensitive = true;
              }
              recorder.record(step);
              history.push(`Filled ${action.label || "field"} (user provided)`);
            } else {
              // Non-field prompt (e.g. CAPTCHA)
              history.push(`User handled: ${action.description}`);
            }

            await page.waitForTimeout(500);
            break;
          }

          // Execute the action
          await executeAction(page, action);
          recorder.record({ action, url: snap.url, timestamp: Date.now() });
          history.push(`${action.type}: ${action.description}`);
          await page.waitForTimeout(1000);
          break;
        } catch (err: any) {
          lastError = err.message ?? "Unknown error";
          // Bail immediately on auth errors — no point retrying
          if (lastError!.includes("authentication") || lastError!.includes("apiKey") || lastError!.includes("401")) {
            console.error(`\nFatal: API authentication failed. Check your key at ~/.domn8n/keys/anthropic.key`);
            process.exit(1);
          }
          console.log(`  ✗ Attempt ${attempt + 1}/${MAX_RETRIES} failed: ${lastError}`);
          if (attempt === MAX_RETRIES - 1) {
            console.log("  Skipping this action after max retries.");
            history.push(`FAILED: ${lastError}`);
          }
        }
      }

      if (action?.type === "goal_reached") break;
      stepCount++;
    }

    // Generate script
    const scriptName = new URL(args.url).hostname.replace(/\./g, "-") + "-" + args.goal.slice(0, 30).replace(/[^a-zA-Z0-9]/g, "-").toLowerCase();
    const scriptPath = await recorder.generate(scriptName);
    console.log(`\nScript saved to: ${scriptPath}`);
  } finally {
    await browser.close();
  }
}

async function executeAction(page: any, action: Action) {
  switch (action.type) {
    case "click":
      await page.click(action.selector!, { timeout: 5000 });
      break;
    case "fill":
      await page.fill(action.selector!, action.value || "");
      break;
    case "select":
      await page.selectOption(action.selector!, action.value || "");
      break;
    case "navigate":
      await page.goto(action.url!, { waitUntil: "domcontentloaded" });
      break;
    case "wait":
      await page.waitForLoadState("networkidle");
      break;
  }
}

async function promptUser(label: string, sensitive: boolean): Promise<string> {
  const { prompt, promptSecret } = await import("./prompt.js");
  return sensitive ? promptSecret(`domn8n needs: ${label}`) : prompt(`domn8n needs: ${label}`);
}

function parseArgs(): { url?: string; goal?: string } {
  const args = process.argv.slice(2);
  let url: string | undefined;
  let goal: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--url" && args[i + 1]) url = args[++i];
    if (args[i] === "--goal" && args[i + 1]) goal = args[++i];
  }

  return { url, goal };
}

main().catch((err) => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
