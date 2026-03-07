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
You are an autonomous agent.

Your job:
1) Carefully review the user's prompt and understand the goal.
2) Decide whether solving the task needs tool usage.
3) If tools are useful, call only the minimum tools needed.
4) If tools are not needed, solve directly.
5) If the user's request is higher-level than any single tool, combine multiple tool calls to complete it.

Available features and tools:
${tools.TOOL_FEATURE_SUMMARY}

When the user asks to create, review, complete, or delete tasks, use the todo tools instead of pretending you already know the todo state. Refer to todos by title, not by numeric ids.

Tool composition rules:
- You may chain multiple tool calls to satisfy one request.
- If the user asks for a bulk action like deleting all todos, first inspect the current state with list_todos, then call delete_todo once for each matching title.
- If the user refers to a todo indirectly, inspect the current todo list before deciding what to do.
- Do not claim an action succeeded unless the required tool calls actually succeeded.
- Prefer using tools over guessing about the current todo state.

Execution rules:
- Prefer correctness over speed.
- Validate assumptions before finalizing.
- Keep responses concise and actionable.
- If information is missing, clearly state what is missing.
- Never invent tool outputs.

Output format:
- Brief reasoning summary
- Steps taken (and tools used, if any)
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