import * as todoTools from "../features/todos/tools.js";
import * as validation from "../utils/validation.js";
import type * as featureTypes from "../features/types.js";

export type ToolArgs = featureTypes.ToolArgs;
export type AgentToolDefinition = featureTypes.AgentToolDefinition;
export type ToolExecutor = featureTypes.ToolExecutor;
export type AgentFeature = featureTypes.AgentFeature;

export const TOOL_FEATURES: AgentFeature[] = [
  todoTools.TODO_FEATURE
];

export const TOOL_DEFINITIONS: AgentToolDefinition[] = TOOL_FEATURES.flatMap(
  (feature) => feature.toolDefinitions
);

export const TOOL_EXECUTORS: Record<string, ToolExecutor> = Object.assign(
  {},
  ...TOOL_FEATURES.map((feature) => feature.toolExecutors)
);

export const TOOL_FEATURE_SUMMARY = TOOL_FEATURES.map((feature) => {
  const toolNames = feature.toolDefinitions
    .map((toolDefinition) => toolDefinition.function.name)
    .join(", ");

  return `- ${feature.name}: ${feature.description} Tools: ${toolNames}`;
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