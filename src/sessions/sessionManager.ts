import fs from "fs";
import path from "path";

const BASE_DIR = ".agent-sessions";
const ACTIVE_FILE = path.join(BASE_DIR, ".active");

export type SessionState = {
  sessionId: string;
  context: string;
  iteration: number;
  createdAt: string;
};

export function createSession(context: string): string {
  fs.mkdirSync(BASE_DIR, { recursive: true });

  const existing = fs.readdirSync(BASE_DIR)
    .filter(name => /^\d+$/.test(name))
    .map(Number);

  const nextId = existing.length > 0
    ? Math.max(...existing) + 1
    : 1;

  const sessionId = String(nextId);
  const sessionDir = path.join(BASE_DIR, sessionId);

  fs.mkdirSync(sessionDir);

  const state: SessionState = {
    sessionId,
    context,
    iteration: 0,
    createdAt: new Date().toISOString()
  };

  fs.writeFileSync(
    path.join(sessionDir, "state.json"),
    JSON.stringify(state, null, 2)
  );

  // Mark as active session
  fs.writeFileSync(ACTIVE_FILE, sessionId);

  return sessionId;
}

export function getActiveSessionId(): string {
  if (!fs.existsSync(ACTIVE_FILE)) {
    throw new Error("No active session. Run 'agent start' first.");
  }

  return fs.readFileSync(ACTIVE_FILE, "utf8").trim();
}

export function getSessionStatePath(sessionId: string): string {
  return path.join(BASE_DIR, sessionId, "state.json");
}

export function getSessionDir(sessionId: string): string {
  return path.join(BASE_DIR, sessionId);
}

export function getActiveSessionDir(): string {
  return getSessionDir(getActiveSessionId());
}