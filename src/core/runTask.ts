import fs from "fs";
import { askLLM } from "./llm.js";
import { getActiveSessionId, getSessionStatePath, type SessionState } from "../sessions/sessionManager.js";

const MAX_TASK_HISTORY = 10;

export async function runTask(instruction: string): Promise<string> {
  const sessionId = getActiveSessionId();

  const statePath = getSessionStatePath(sessionId);

  const state = JSON.parse(
    fs.readFileSync(statePath, "utf8")
  ) as SessionState;

  const result = await askLLM({
    sessionContext: state.context,
    instruction
  });

  const runAt = new Date().toISOString();
  const taskHistoryEntry = {
    instruction,
    prompt: result.prompt,
    toolsUsed: result.toolsUsed,
    response: result.response,
    runAt
  };
  const existingTaskHistory = Array.isArray(state.taskHistory)
    ? state.taskHistory
    : [];

  const normalizedState: SessionState = {
    sessionId: state.sessionId,
    context: state.context,
    iteration: state.iteration + 1,
    createdAt: state.createdAt,
    taskHistory: [...existingTaskHistory, taskHistoryEntry].slice(-MAX_TASK_HISTORY)
  };

  fs.writeFileSync(statePath, JSON.stringify(normalizedState, null, 2));

  return result.response;
}