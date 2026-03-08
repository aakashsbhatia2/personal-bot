import * as todoTools from "../powers/todos/tools.js";
import * as timeTools from "../powers/time/tools.js";
import * as validation from "../utils/validation.js";
import type * as powerTypes from "../powers/types.js";

export type ToolArgs = powerTypes.ToolArgs;
export type AgentToolDefinition = powerTypes.AgentToolDefinition;
export type ToolExecutor = powerTypes.ToolExecutor;
export type AgentPower = powerTypes.AgentPower;

export const TOOL_POWERS: AgentPower[] = [
  timeTools.TIME_POWER,
  todoTools.TODO_POWER
];

export const TOOL_DEFINITIONS: AgentToolDefinition[] = TOOL_POWERS.flatMap(
  (power) => power.toolDefinitions
);

export const TOOL_EXECUTORS: Record<string, ToolExecutor> = Object.assign(
  {},
  ...TOOL_POWERS.map((power) => power.toolExecutors)
);

export const TOOL_POWER_SUMMARY = TOOL_POWERS.map((power) => {
  const toolNames = power.toolDefinitions
    .map((toolDefinition) => toolDefinition.function.name)
    .join(", ");

  return `- ${power.name}: ${power.description} Tools: ${toolNames}`;
}).join("\n");

export async function executeTool(name: string, rawArgs: string): Promise<string> {
  try {
    const parsedJson = rawArgs ? JSON.parse(rawArgs) : {};
    if (!validation.isObject(parsedJson)) {
      throw new Error("Tool arguments must be a JSON object.");
    }

    const parsedArgs = parsedJson as ToolArgs;
    const executor = TOOL_EXECUTORS[name];
    if (!executor) {
      return JSON.stringify({ error: `Unknown tool: ${name}` }, null, 2);
    }
    const result = await executor(parsedArgs);
    return JSON.stringify({ tool: name, result }, null, 2);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Tool execution failed.";
    return JSON.stringify({ tool: name, error: message }, null, 2);
  }
}