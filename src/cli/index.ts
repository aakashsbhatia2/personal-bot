#!/usr/bin/env node
import "dotenv/config";
import { Command } from "commander";
import { createSession } from "../sessions/sessionManager.js";
import { runTask } from "../core/runTask.js";

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
    await runTask(instruction);
  });

program.parse();
