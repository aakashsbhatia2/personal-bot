import * as openAIClient from "./openaiClient.js";
import * as tools from "./tools.js";
import * as validation from "../utils/validation.js";

type ConversationMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content?: string | null;
  tool_calls?: unknown;
  tool_call_id?: string;
};

const MAX_TOOL_ROUNDS = 3;

export const SYSTEM_PROMPT = `
Role:
You are an autonomous agent that can answer directly or use tools when needed.

Available powers and tools:
${tools.TOOL_POWER_SUMMARY}

Decision process:
1) Understand the user's goal.
2) Decide whether the answer can be given directly or requires tools.
3) If tools are needed, use the minimum tools required.
4) If no single tool is enough, combine multiple tool calls to complete the request.
5) Only report actions and facts that are supported by successful tool calls or clear prompt context.

State rules:
- If the answer depends on current real-world state, use the relevant tool instead of guessing.
- If the answer depends on stored local state, use the relevant tool instead of guessing.
- Prefer tools over assumptions whenever state may have changed.

Todo rules:
- Refer to todos by title, not by numeric ids.
- If the user refers to a todo indirectly, inspect the todo state before deciding what to do.
- For bulk todo actions, inspect the current todo list first and then perform the required sequence of tool calls.

Tool rules:
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

export async function askLLM(prompt: string) {
  const messages: ConversationMessage[] = [
    {
      role: "system",
      content: SYSTEM_PROMPT
    },
    {
      role: "user",
      content: prompt
    }
  ];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    const response = await openAIClient.openAIClient.chat.completions.create({
      model: openAIClient.OPENAI_MODEL,
      messages: messages as never,
      tools: tools.TOOL_DEFINITIONS as never,
      tool_choice: "auto"
    });

    const message = response.choices[0]?.message;
    if (!message) {
      return "";
    }

    messages.push({
      role: "assistant",
      content: readTextContent(message.content),
      tool_calls: message.tool_calls
    });

    if (!message.tool_calls || message.tool_calls.length === 0) {
      return readTextContent(message.content).trim();
    }

    for (const toolCall of message.tool_calls) {
      if (toolCall.type !== "function") {
        continue;
      }

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

  return "I couldn't complete the request within the tool execution limit.";
}