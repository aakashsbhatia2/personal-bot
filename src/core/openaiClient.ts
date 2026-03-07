import OpenAI from "openai";

function readRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export const OPENAI_MODEL = readRequiredEnv("OPENAI_MODEL");

export const openAIClient = new OpenAI({
  apiKey: readRequiredEnv("OPENAI_API_KEY")
});