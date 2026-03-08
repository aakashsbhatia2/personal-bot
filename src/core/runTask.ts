import fs from "fs";
import { askLLM } from "./llm.js";
import { getActiveSessionId, getSessionStatePath, type SessionState } from "../sessions/sessionManager.js";

export async function runTask(instruction: string): Promise<string> {
  const sessionId = getActiveSessionId();

  const statePath = getSessionStatePath(sessionId);

  const state = JSON.parse(
    fs.readFileSync(statePath, "utf8")
  ) as SessionState & { lastResponse?: string; lastRunAt?: string };

  const prompt = `
Session Context:
${state.context}

Instruction:
${instruction}
`;

  const response = await askLLM(prompt);

  state.lastResponse = response;
  state.lastRunAt = new Date().toISOString();
  state.iteration += 1;

  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));

  return response;
}