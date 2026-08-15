const GEMINI_MODEL = "gemini-3-flash-preview";
const GEMINI_API_BASE_URL =
  "https://generativelanguage.googleapis.com/v1beta";

export type GeminiConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
};

export function getGeminiConfig(): GeminiConfig {
  const apiKey = process.env.GEMINI_API_KEY?.trim();

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured on the server");
  }

  return {
    apiKey,
    baseUrl: GEMINI_API_BASE_URL,
    model: GEMINI_MODEL,
  };
}

export function isGeminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY?.trim());
}

export const geminiPublicConfig = {
  provider: "gemini",
  model: GEMINI_MODEL,
  client: "server",
} as const;