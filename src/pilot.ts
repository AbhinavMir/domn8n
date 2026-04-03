import Anthropic from "@anthropic-ai/sdk";
import { Action, DomSnapshot, NetworkCall } from "./types.js";

let client: Anthropic;

export function initPilot(apiKey: string) {
  client = new Anthropic({ apiKey });
}

const SYSTEM_PROMPT = `You are domn8n, an AI browser automation pilot. You are given a DOM snapshot of a web page and a goal. You decide the next action to take.

Rules:
- Return EXACTLY ONE action as JSON
- For password/secret fields, use type "ask_user" with sensitive: true — NEVER fill them yourself
- For other fields you don't know the value of, use "ask_user" with sensitive: false
- When the goal is achieved, return type "goal_reached"
- Use CSS selectors from the snapshot — do not invent selectors
- Keep descriptions short and human-readable
- If a page looks like a CAPTCHA or bot detection, return: {"type": "ask_user", "label": "Please solve the CAPTCHA in the browser, then press Enter", "sensitive": false, "description": "CAPTCHA detected"}

Action types:
- click: { type: "click", selector, description }
- fill: { type: "fill", selector, value, description } — for non-sensitive fields you know the value of
- select: { type: "select", selector, value, description }
- navigate: { type: "navigate", url, description }
- wait: { type: "wait", description } — wait for page to settle
- ask_user: { type: "ask_user", label, sensitive, description } — prompt user for input. Set sensitive=true for passwords/secrets
- goal_reached: { type: "goal_reached", description }`;

export async function decideAction(
  goal: string,
  snap: DomSnapshot,
  networkLog: NetworkCall[],
  history: string[],
  error?: string
): Promise<Action> {
  const userMessage = buildPrompt(goal, snap, networkLog, history, error);

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
  });

  const text = response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");

  // Extract JSON from response
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error(`Pilot returned no JSON: ${text}`);

  return JSON.parse(jsonMatch[0]) as Action;
}

function buildPrompt(
  goal: string,
  snap: DomSnapshot,
  networkLog: NetworkCall[],
  history: string[],
  error?: string
): string {
  const parts: string[] = [];

  parts.push(`## Goal\n${goal}`);
  parts.push(`## Current Page\nURL: ${snap.url}\nTitle: ${snap.title}`);

  if (snap.forms.length > 0) {
    const formSummary = snap.forms.map((f) => {
      const fields = f.fields
        .map((field) => {
          const label = field.label || field.placeholder || field.type || "unknown";
          const isSensitive = field.type === "password";
          return `  - ${label} (${field.tag}${field.type ? `[type=${field.type}]` : ""}) → ${field.selector}${isSensitive ? " [SENSITIVE - use ask_user]" : ""}`;
        })
        .join("\n");
      const submit = f.submitButton ? `  Submit: ${f.submitButton.text || "submit"} → ${f.submitButton.selector}` : "";
      return `Form ${f.selector}:\n${fields}${submit ? "\n" + submit : ""}`;
    });
    parts.push(`## Forms\n${formSummary.join("\n\n")}`);
  }

  if (snap.elements.length > 0) {
    const elSummary = snap.elements
      .filter((e) => !["input", "select", "textarea"].includes(e.tag))
      .slice(0, 50)
      .map((e) => `- ${e.text?.slice(0, 60) || e.tag} (${e.tag}${e.role ? `[role=${e.role}]` : ""}) → ${e.selector}`)
      .join("\n");
    parts.push(`## Interactive Elements\n${elSummary}`);
  }

  if (snap.links.length > 0) {
    const linkSummary = snap.links
      .slice(0, 30)
      .map((l) => `- "${l.text.slice(0, 60)}" → ${l.href} (${l.selector})`)
      .join("\n");
    parts.push(`## Links\n${linkSummary}`);
  }

  const recentNetwork = networkLog.slice(-20);
  if (recentNetwork.length > 0) {
    const netSummary = recentNetwork
      .map((n) => `- ${n.method} ${n.url.slice(0, 100)} → ${n.status || "pending"}`)
      .join("\n");
    parts.push(`## Recent Network\n${netSummary}`);
  }

  parts.push(`## Page Text (excerpt)\n${snap.text.slice(0, 1500)}`);

  if (history.length > 0) {
    parts.push(`## Actions taken so far\n${history.join("\n")}`);
  }

  if (error) {
    parts.push(`## Last action FAILED\nError: ${error}\nPlease try a different approach.`);
  }

  parts.push("Return ONE JSON action object. No markdown fences, just raw JSON.");

  return parts.join("\n\n");
}
