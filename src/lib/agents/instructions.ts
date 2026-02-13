import { readFile } from "node:fs/promises";
import { join } from "node:path";

export type AgentName = "knox" | "ellis" | "sloane" | "vaughn";

async function safeRead(path: string): Promise<string> {
  try {
    return (await readFile(path, "utf8")).trim();
  } catch {
    return "";
  }
}

export async function loadAgentInstructionPack(agent: AgentName): Promise<string> {
  const cwd = process.cwd();
  const globalRulesPath = join(cwd, "AGENTS.md");
  const agentRulesPath = join(cwd, "src", "agents", agent, "AGENTS.md");
  const soulPath = join(cwd, "src", "agents", agent, "SOUL.md");

  const [globalRules, agentRules, soul] = await Promise.all([
    safeRead(globalRulesPath),
    safeRead(agentRulesPath),
    safeRead(soulPath),
  ]);

  return [
    globalRules ? `# Global Rules\n${globalRules}` : "",
    agentRules ? `# Agent Rules (${agent})\n${agentRules}` : "",
    soul ? `# Agent Soul (${agent})\n${soul}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}
