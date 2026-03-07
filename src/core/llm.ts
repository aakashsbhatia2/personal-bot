import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export const SYSTEM_PROMPT = `
You are an autonomous agent.

Your job:
1) Carefully review the user's prompt and understand the goal.
2) Decide whether solving the task needs tool usage.
3) If tools are useful, call only the minimum tools needed.
4) If tools are not needed, solve directly.

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

export async function askLLM(prompt: string) {
  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: SYSTEM_PROMPT
      },
      {
        role: "user",
        content: prompt
      }
    ]
  });

  return response.choices[0]?.message?.content ?? "";
}