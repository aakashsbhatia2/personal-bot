import * as openAIClient from "./openaiClient.js";
import * as tools from "./tools.js";
import * as validation from "../utils/validation.js";

type ConversationMessage = {
  role: "system" | "developer" | "user" | "assistant" | "tool";
  content?: string | null;
  tool_calls?: unknown;
  tool_call_id?: string;
};

type TaskRequest = {
  sessionContext: string;
  instruction: string;
};

export type TaskExecutionResult = {
  response: string;
  prompt: string;
  toolsUsed: string[];
};

type RouterDecision = {
  powerIds: string[];
  reason: string;
};

const MAX_TOOL_ROUNDS = 3;

const ROUTER_SYSTEM_PROMPT = `
Role:
You are a task router for an autonomous local agent.

Available powers:
${tools.TOOL_ROUTING_SUMMARY}

Instructions:
- Read the user's instruction and select only the powers required to solve it.
- Return zero powers if the task can be answered directly without tools.
- Return multiple powers only when the task clearly needs them together.
- Never include a power unless it is actually relevant.

Output:
Return strict JSON with this shape:
{"powerIds":["power_id"],"reason":"short reason"}
`.trim();

export const SYSTEM_PROMPT = `
Role:
You are an autonomous agent that can answer directly or use tools when needed.

State rules:
- If the answer depends on current real-world state, use the relevant tool instead of guessing.
- If the answer depends on stored local state, use the relevant tool instead of guessing.
- Prefer tools over assumptions whenever state may have changed.

Tool rules:
- Use only the tools provided for this request.
- You may chain multiple tool calls in a single request.
- Do not claim a tool action succeeded unless the tool call actually succeeded.
- Never invent tool outputs.

Response style:
- Be concise, clear, and practical.
- If information is missing, say what is missing.
- Prefer direct answers over unnecessary explanation.

Output format:
- Brief reasoning summary
- Steps taken and tools used if any
- Final answer
`.trim();

function buildSystemPrompt(selectedPowers: tools.AgentPower[]): string {
  return SYSTEM_PROMPT;
}

function buildPowerContextPrompt(selectedPowers: tools.AgentPower[]): string {
  const powerSummary = selectedPowers.length > 0
    ? tools.getPowerSummary(selectedPowers)
    : "No tools are available for this request. Answer directly from prompt context only.";
  const powerSpecificInstructions = selectedPowers
    .map((power) => power.systemPrompt.trim())
    .filter((systemPrompt) => systemPrompt.length > 0)
    .join("\n\n");

  return [
    powerSpecificInstructions,
    `Available powers and tools for this request:\n${powerSummary}`
  ].filter((section) => section.trim().length > 0).join("\n\n");
}

function buildUserPrompt(task: TaskRequest): string {
  return `
Session Context:
${task.sessionContext}

Instruction:
${task.instruction}
`.trim();
}

function readTextContent(content: unknown): string {
  if (validation.isString(content)) {
    return content;
  }

  if (!validation.isArray(content)) {
    return "";
  }

  return content
    .flatMap((part) => {
      if (!validation.isObject(part)) {
        return [];
      }

      if (
        validation.hasOwnProperty(part, "type") &&
        validation.hasOwnProperty(part, "text") &&
        part.type === "text" &&
        validation.isString(part.text)
      ) {
        return [part.text];
      }

      return [];
    })
    .join("\n");
}

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLocaleLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length >= 3)
  );
}

function fallbackRouteTask(instruction: string): RouterDecision {
  const instructionTokens = tokenize(instruction);
  const scoredPowers = tools.TOOL_POWERS
    .map((power) => {
      const routingText = [
        power.id,
        power.name,
        power.description,
        power.routingDescription,
        ...power.toolDefinitions.map((toolDefinition) => toolDefinition.function.name),
        ...power.toolDefinitions.map((toolDefinition) => toolDefinition.function.description)
      ].join(" ");
      const routingTokens = tokenize(routingText);
      let score = 0;

      for (const token of instructionTokens) {
        if (routingTokens.has(token)) {
          score += 1;
        }
      }

      return { powerId: power.id, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score);

  return {
    powerIds: scoredPowers.map((entry) => entry.powerId),
    reason: scoredPowers.length > 0
      ? "Fallback routing matched the request text to power metadata."
      : "Fallback routing found no power-specific signals."
  };
}

function parseRouterDecision(content: string): RouterDecision | null {
  const trimmedContent = content.trim();
  const jsonCandidate = trimmedContent.match(/\{[\s\S]*\}/)?.[0];
  if (!jsonCandidate) {
    return null;
  }

  try {
    const parsedJson = JSON.parse(jsonCandidate);
    if (!validation.isObject(parsedJson)) {
      return null;
    }

    const powerIds = validation.hasOwnProperty(parsedJson, "powerIds") && validation.isArray(parsedJson.powerIds)
      ? parsedJson.powerIds.filter(validation.isString)
      : [];
    const reason = validation.hasOwnProperty(parsedJson, "reason") && validation.isString(parsedJson.reason)
      ? parsedJson.reason
      : "";

    return { powerIds, reason };
  } catch {
    return null;
  }
}

async function routeTask(instruction: string): Promise<RouterDecision> {
  try {
    const response = await openAIClient.openAIClient.chat.completions.create({
      model: openAIClient.OPENAI_MODEL,
      messages: [
        {
          role: "system",
          content: ROUTER_SYSTEM_PROMPT
        },
        {
          role: "user",
          content: instruction
        }
      ]
    });

    const content = readTextContent(response.choices[0]?.message?.content);
    const parsedDecision = parseRouterDecision(content);
    if (parsedDecision) {
      return parsedDecision;
    }
  } catch {
    // Fall through to metadata-based routing.
  }

  return fallbackRouteTask(instruction);
}

export async function askLLM(task: TaskRequest) {
  const routingDecision = await routeTask(task.instruction);
  const selectedPowers = tools.findPowersByIds(routingDecision.powerIds);
  const toolDefinitions = tools.getToolDefinitionsForPowers(selectedPowers);
  const prompt = buildUserPrompt(task);
  const toolsUsed: string[] = [];
  const messages: ConversationMessage[] = [
    {
      role: "system",
      content: buildSystemPrompt(selectedPowers)
    },
    {
      role: "developer",
      content: buildPowerContextPrompt(selectedPowers)
    },
    {
      role: "user",
      content: prompt
    }
  ];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    const response = toolDefinitions.length > 0
      ? await openAIClient.openAIClient.chat.completions.create({
        model: openAIClient.OPENAI_MODEL,
        messages: messages as never,
        tools: toolDefinitions as never,
        tool_choice: "auto"
      })
      : await openAIClient.openAIClient.chat.completions.create({
        model: openAIClient.OPENAI_MODEL,
        messages: messages as never
      });

    const message = response.choices[0]?.message;
    if (!message) {
      return {
        response: "",
        prompt,
        toolsUsed
      };
    }

    messages.push({
      role: "assistant",
      content: readTextContent(message.content),
      tool_calls: message.tool_calls
    });

    if (!message.tool_calls || message.tool_calls.length === 0) {
      return {
        response: readTextContent(message.content).trim(),
        prompt,
        toolsUsed
      };
    }

    for (const toolCall of message.tool_calls) {
      if (toolCall.type !== "function") {
        continue;
      }

      toolsUsed.push(toolCall.function.name);

      const result = await tools.executeTool(
        toolCall.function.name,
        toolCall.function.arguments
      );

      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: result
      });
    }
  }

  return {
    response: "I couldn't complete the request within the tool execution limit.",
    prompt,
    toolsUsed
  };
}