import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";

const PROMPT = "Respond with the exact word 'OK'.";

async function testAnthropic() {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: "claude-3-5-sonnet-latest",
      max_tokens: 10,
      messages: [{ role: "user", content: PROMPT }],
    });
    const text = response.content.find((b: any) => b.type === "text");
    console.log("✅ [Anthropic] SUCCESS:", text?.type === "text" ? text.text : "no text");
  } catch (error: any) {
    console.error("❌ [Anthropic] FAILED:", error.message);
  }
}

async function testDeepSeek() {
  try {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) throw new Error("DEEPSEEK_API_KEY not set");
    const client = new OpenAI({ apiKey, baseURL: "https://api.deepseek.com" });
    const response = await client.chat.completions.create({
      model: "deepseek-chat",
      messages: [{ role: "user", content: PROMPT }],
      max_tokens: 10,
    });
    const text = response.choices[0]?.message?.content;
    console.log("✅ [DeepSeek] SUCCESS:", text);
  } catch (error: any) {
    console.error("❌ [DeepSeek] FAILED:", error.message);
  }
}

async function testOpenAI() {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY not set");
    const client = new OpenAI({ apiKey });
    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: PROMPT }],
      max_tokens: 10,
    });
    const text = response.choices[0]?.message?.content;
    console.log("✅ [OpenAI] SUCCESS:", text);
  } catch (error: any) {
    console.error("❌ [OpenAI] FAILED:", error.message);
  }
}

async function testGoogle() {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY not set");
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const result = await model.generateContent(PROMPT);
    const text = result.response.text();
    console.log("✅ [Google] SUCCESS:", text);
  } catch (error: any) {
    console.error("❌ [Google] FAILED:", error.message);
  }
}

async function main() {
  console.log("=== AI Health Check ===\n");
  await testAnthropic();
  await testDeepSeek();
  await testOpenAI();
  await testGoogle();
  console.log("\n=== Done ===");
}

main();
