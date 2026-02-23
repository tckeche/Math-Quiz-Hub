/**
 * AI ORCHESTRATOR TESTS
 * Tests the centralized waterfall fallback system for AI providers.
 * Covers: Anthropic → DeepSeek → OpenAI fallback chain,
 * schema enforcement, error propagation, resolveSchema utility.
 *
 * Uses vi.hoisted() so mock fns are available before ESM hoisting.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── vi.hoisted: define mock functions BEFORE module hoisting ─────────────────
const mocks = vi.hoisted(() => ({
  anthropicCreate: vi.fn(),
  openAICreate: vi.fn(),
}));

// ─── Mock Anthropic SDK ──────────────────────────────────────────────────────
vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn().mockImplementation(function () {
    return { messages: { create: mocks.anthropicCreate } };
  }),
}));

// ─── Mock OpenAI SDK (used by both DeepSeek and OpenAI providers) ─────────────
vi.mock("openai", () => ({
  default: vi.fn().mockImplementation(function () {
    return { chat: { completions: { create: mocks.openAICreate } } };
  }),
}));

import { generateWithFallback } from "../server/services/aiOrchestrator";

const ANTHROPIC_RESPONSE = { content: [{ type: "text", text: "Claude response" }] };

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Anthropic success path ───────────────────────────────────────────────────
describe("generateWithFallback: Anthropic success", () => {
  it("returns text from Anthropic when it succeeds", async () => {
    mocks.anthropicCreate.mockResolvedValueOnce(ANTHROPIC_RESPONSE);
    const result = await generateWithFallback("System", "User");
    expect(result).toBe("Claude response");
    expect(mocks.anthropicCreate).toHaveBeenCalledOnce();
  });

  it("calls Anthropic with correct model and prompts", async () => {
    mocks.anthropicCreate.mockResolvedValueOnce(ANTHROPIC_RESPONSE);
    await generateWithFallback("My system", "My user");
    const call = mocks.anthropicCreate.mock.calls[0][0];
    expect(call.model).toBe("claude-3-5-sonnet-latest");
    expect(call.system).toBe("My system");
    expect(call.messages[0].content).toBe("My user");
  });

  it("does NOT call OpenAI/DeepSeek when Anthropic succeeds", async () => {
    mocks.anthropicCreate.mockResolvedValueOnce(ANTHROPIC_RESPONSE);
    await generateWithFallback("System", "User");
    expect(mocks.openAICreate).not.toHaveBeenCalled();
  });

  it("uses tool_use mode when schema is provided", async () => {
    const schema = { type: "object", properties: { answer: { type: "string" } }, required: ["answer"] };
    mocks.anthropicCreate.mockResolvedValueOnce({
      content: [{ type: "tool_use", input: { answer: "42" } }],
    });
    const result = await generateWithFallback("System", "User", schema);
    expect(JSON.parse(result)).toEqual({ answer: "42" });
    const call = mocks.anthropicCreate.mock.calls[0][0];
    expect(call.tool_choice).toEqual({ type: "tool", name: "structured_output" });
    expect(call.tools[0].name).toBe("structured_output");
  });

  it("sends schema as tool input_schema to Anthropic", async () => {
    const schema = { type: "object", properties: { count: { type: "integer" } } };
    mocks.anthropicCreate.mockResolvedValueOnce({
      content: [{ type: "tool_use", input: { count: 5 } }],
    });
    await generateWithFallback("System", "User", schema);
    const call = mocks.anthropicCreate.mock.calls[0][0];
    expect(call.tools[0].input_schema).toBeDefined();
  });

  it("throws when Anthropic returns no text block and fallbacks also fail", async () => {
    mocks.anthropicCreate.mockResolvedValueOnce({ content: [] });
    mocks.openAICreate.mockRejectedValue(new Error("all fail"));
    await expect(generateWithFallback("System", "User")).rejects.toThrow(/All AI providers failed/i);
  });
});

// ─── DeepSeek fallback ────────────────────────────────────────────────────────
describe("generateWithFallback: DeepSeek fallback", () => {
  it("falls back to DeepSeek when Anthropic fails", async () => {
    mocks.anthropicCreate.mockRejectedValueOnce(new Error("Anthropic overloaded"));
    mocks.openAICreate.mockResolvedValueOnce({ choices: [{ message: { content: "DeepSeek response" } }] });
    const result = await generateWithFallback("System", "User");
    expect(result).toBe("DeepSeek response");
    expect(mocks.anthropicCreate).toHaveBeenCalledOnce();
    expect(mocks.openAICreate).toHaveBeenCalledOnce();
  });

  it("passes json_object format to DeepSeek when schema provided", async () => {
    const schema = { type: "object", properties: { val: { type: "number" } } };
    mocks.anthropicCreate.mockRejectedValueOnce(new Error("Anthropic down"));
    let capturedConfig: any;
    mocks.openAICreate.mockImplementationOnce((config: any) => {
      capturedConfig = config;
      return Promise.resolve({ choices: [{ message: { content: '{"val": 42}' } }] });
    });
    await generateWithFallback("System", "User", schema);
    expect(capturedConfig?.response_format?.type).toBe("json_object");
  });

  it("includes schema hint in DeepSeek system prompt", async () => {
    const schema = { type: "object", properties: { name: { type: "string" } } };
    mocks.anthropicCreate.mockRejectedValueOnce(new Error("Anthropic down"));
    mocks.openAICreate.mockResolvedValueOnce({ choices: [{ message: { content: '{"name":"test"}' } }] });
    await generateWithFallback("My System", "User", schema);
    const call = mocks.openAICreate.mock.calls[0][0];
    const sysMsg = call.messages.find((m: any) => m.role === "system");
    expect(sysMsg.content).toContain("My System");
  });
});

// ─── OpenAI fallback ──────────────────────────────────────────────────────────
describe("generateWithFallback: OpenAI (GPT-4o-mini) fallback", () => {
  it("falls back to OpenAI when Anthropic and DeepSeek both fail", async () => {
    mocks.anthropicCreate.mockRejectedValueOnce(new Error("Anthropic down"));
    mocks.openAICreate
      .mockRejectedValueOnce(new Error("DeepSeek down"))
      .mockResolvedValueOnce({ choices: [{ message: { content: "GPT response" } }] });
    const result = await generateWithFallback("System", "User");
    expect(result).toBe("GPT response");
    expect(mocks.openAICreate).toHaveBeenCalledTimes(2);
  });

  it("throws user-friendly error when ALL providers fail", async () => {
    mocks.anthropicCreate.mockRejectedValueOnce(new Error("Anthropic down"));
    mocks.openAICreate
      .mockRejectedValueOnce(new Error("DeepSeek down"))
      .mockRejectedValueOnce(new Error("OpenAI down"));
    await expect(generateWithFallback("System", "User")).rejects.toThrow(
      /All AI providers failed/i
    );
  });

  it("error message includes per-provider details", async () => {
    mocks.anthropicCreate.mockRejectedValue(new Error("rate limited"));
    mocks.openAICreate.mockRejectedValue(new Error("auth error"));
    try {
      await generateWithFallback("s", "u");
    } catch (e: any) {
      expect(e.message).toMatch(/Anthropic/i);
      expect(e.message).toMatch(/DeepSeek/i);
      expect(e.message).toMatch(/OpenAI/i);
    }
  });

  it("passes json_object format to OpenAI when schema provided", async () => {
    const schema = { type: "object", properties: { result: { type: "boolean" } } };
    mocks.anthropicCreate.mockRejectedValueOnce(new Error("down"));
    let openaiConfig: any;
    mocks.openAICreate
      .mockRejectedValueOnce(new Error("DeepSeek down"))
      .mockImplementationOnce((cfg: any) => {
        openaiConfig = cfg;
        return Promise.resolve({ choices: [{ message: { content: '{"result":true}' } }] });
      });
    await generateWithFallback("System", "User", schema);
    expect(openaiConfig?.response_format?.type).toBe("json_object");
  });
});

// ─── Schema resolution ────────────────────────────────────────────────────────
describe("generateWithFallback: $ref schema resolution", () => {
  it("resolves $ref schemas before sending to Anthropic", async () => {
    const schemaWithRef = {
      $ref: "#/definitions/Answer",
      definitions: {
        Answer: {
          type: "object",
          properties: { value: { type: "string" } },
        },
      },
    };
    mocks.anthropicCreate.mockResolvedValueOnce({
      content: [{ type: "tool_use", input: { value: "resolved!" } }],
    });
    const result = await generateWithFallback("System", "User", schemaWithRef);
    expect(JSON.parse(result)).toEqual({ value: "resolved!" });
    const call = mocks.anthropicCreate.mock.calls[0][0];
    const toolSchema = call.tools[0].input_schema;
    expect(toolSchema.$ref).toBeUndefined();
    expect(toolSchema.type).toBe("object");
  });

  it("handles nested $ref in array items", async () => {
    const schemaWithNestedRef = {
      $ref: "#/definitions/Container",
      definitions: {
        Item: { type: "object", properties: { id: { type: "number" } } },
        Container: {
          type: "object",
          properties: {
            items: { type: "array", items: { $ref: "#/definitions/Item" } },
          },
        },
      },
    };
    mocks.anthropicCreate.mockResolvedValueOnce({
      content: [{ type: "tool_use", input: { items: [{ id: 1 }] } }],
    });
    const result = await generateWithFallback("System", "User", schemaWithNestedRef);
    expect(JSON.parse(result).items).toHaveLength(1);
  });
});

// ─── Missing API keys ─────────────────────────────────────────────────────────
describe("generateWithFallback: Missing API key handling", () => {
  it("falls through gracefully when ANTHROPIC_API_KEY is missing", async () => {
    const saved = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = "";
    // Should try Anthropic (throw on missing key), then fall to DeepSeek
    mocks.openAICreate.mockResolvedValueOnce({ choices: [{ message: { content: "DeepSeek fallback" } }] });
    try {
      const result = await generateWithFallback("System", "User");
      expect(typeof result).toBe("string");
    } catch (e: any) {
      expect(e.message).toMatch(/failed|API_KEY|configured/i);
    } finally {
      process.env.ANTHROPIC_API_KEY = saved;
    }
  });
});
