import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { zodToJsonSchema } from "zod-to-json-schema";

function getAnthropicClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured");
  return new Anthropic({ apiKey });
}

function getDeepSeekClient() {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error("DEEPSEEK_API_KEY is not configured");
  return new OpenAI({ apiKey, baseURL: "https://api.deepseek.com" });
}

function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured");
  return new OpenAI({ apiKey });
}

async function tryAnthropic(
  systemPrompt: string,
  userPrompt: string,
  expectedSchema?: any
): Promise<string> {
  const client = getAnthropicClient();

  if (expectedSchema) {
    const schemaJson = typeof expectedSchema === "function" && expectedSchema._def
      ? zodToJsonSchema(expectedSchema)
      : expectedSchema;

    const toolDef = {
      name: "structured_output",
      description: "Return structured data matching the required schema",
      input_schema: schemaJson.definitions
        ? schemaJson.definitions[Object.keys(schemaJson.definitions)[0]]
        : schemaJson,
    };

    const response = await client.messages.create({
      model: "claude-3-5-sonnet-latest",
      max_tokens: 8192,
      system: systemPrompt,
      tools: [toolDef as any],
      tool_choice: { type: "tool" as const, name: "structured_output" },
      messages: [{ role: "user", content: userPrompt }],
    });

    const toolBlock = response.content.find((b: any) => b.type === "tool_use");
    if (!toolBlock || toolBlock.type !== "tool_use") {
      throw new Error("Claude did not return a tool_use block");
    }
    return JSON.stringify(toolBlock.input);
  }

  const response = await client.messages.create({
    model: "claude-3-5-sonnet-latest",
    max_tokens: 8192,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  const textBlock = response.content.find((b: any) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Claude returned no text content");
  }
  return textBlock.text;
}

async function tryDeepSeek(
  systemPrompt: string,
  userPrompt: string,
  expectedSchema?: any
): Promise<string> {
  const client = getDeepSeekClient();

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: expectedSchema
        ? `${systemPrompt}\n\nYou must output valid JSON matching this schema. Write 'json' in your response.\nSchema: ${JSON.stringify(typeof expectedSchema === "function" && expectedSchema._def ? zodToJsonSchema(expectedSchema) : expectedSchema)}`
        : systemPrompt,
    },
    { role: "user", content: userPrompt },
  ];

  const config: any = {
    model: "deepseek-chat",
    messages,
  };

  if (expectedSchema) {
    config.response_format = { type: "json_object" };
  }

  const response = await client.chat.completions.create(config);
  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("DeepSeek returned empty response");
  return content;
}

async function tryOpenAI(
  systemPrompt: string,
  userPrompt: string,
  expectedSchema?: any
): Promise<string> {
  const client = getOpenAIClient();

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];

  const config: any = {
    model: "gpt-4o-mini",
    messages,
  };

  if (expectedSchema) {
    config.response_format = { type: "json_object" };
    messages[0] = {
      role: "system",
      content: `${systemPrompt}\n\nYou must respond with valid JSON matching the required schema.`,
    };
  }

  const response = await client.chat.completions.create(config);
  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("OpenAI returned empty response");
  return content;
}

export async function generateWithFallback(
  systemPrompt: string,
  userPrompt: string,
  expectedSchema?: any
): Promise<string> {
  try {
    return await tryAnthropic(systemPrompt, userPrompt, expectedSchema);
  } catch (err: any) {
    console.warn(`[AI Orchestrator] Claude failed (${err?.message || "unknown"}), falling back to DeepSeek...`);
  }

  try {
    return await tryDeepSeek(systemPrompt, userPrompt, expectedSchema);
  } catch (err: any) {
    console.warn(`[AI Orchestrator] DeepSeek failed (${err?.message || "unknown"}), falling back to OpenAI...`);
  }

  try {
    return await tryOpenAI(systemPrompt, userPrompt, expectedSchema);
  } catch (err: any) {
    console.warn(`[AI Orchestrator] OpenAI failed (${err?.message || "unknown"})`);
  }

  throw new Error("All AI providers are currently unavailable due to high traffic.");
}
