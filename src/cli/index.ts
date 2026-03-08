#!/usr/bin/env node
import "dotenv/config";
import { createInterface } from "readline/promises";
import { stdin as input, stdout as output } from "process";
import { Command } from "commander";
import { createSession } from "../sessions/sessionManager.js";
import { runTask } from "../core/runTask.js";

function printAgentResponse(response: string): void {
  console.log(`agent> ${response}\n`);
}

async function startChatLoop(): Promise<void> {
  const readlineInterface = createInterface({ input, output });

  console.log("agent> Chat mode started. Type /exit to leave. Type /help for commands.\n");

  try {
    while (true) {
      const instruction = (await readlineInterface.question("you> ")).trim();

      if (!instruction) {
        continue;
      }

      if (instruction === "/exit") {
        console.log("agent> Goodbye.");
        break;
      }

      if (instruction === "/help") {
        console.log("agent> Commands: /help, /exit\n");
        continue;
      }

      try {
        const response = await runTask(instruction);
        printAgentResponse(response);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Task failed.";
        console.error(`agent> Error: ${message}\n`);
      }
    }
  } finally {
    readlineInterface.close();
  }
}

const program = new Command();

program
  .name("agent")
  .description("Autonomous Dev Agent")
  .version("1.0.0");

program
  .command("start")
  .requiredOption("-t, --text <description>")
  .description("Start a new session")
  .action((options) => {
    const id = createSession(options.text);
    console.log(`Created session ${id} (now active)`);
  });

program
  .command("task")
  .argument("<instruction>")
  .description("Send instruction to active session")
  .action(async (instruction) => {
    const response = await runTask(instruction);
    printAgentResponse(response);
  });

program
  .command("chat")
  .description("Start an interactive chat with the active session")
  .action(async () => {
    await startChatLoop();
  });

program.parse();
