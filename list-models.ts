import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

async function checkModels() {
  console.log("--- 🟢 OpenAI Available Models ---");
  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const models = await openai.models.list();
    console.log(models.data.map(m => m.id).filter(id => id.includes("gpt")).join("\n"));
  } catch (e: any) { console.error("OpenAI Error:", e.message); }

  console.log("\n--- 🔵 DeepSeek Available Models ---");
  try {
    const deepseek = new OpenAI({ apiKey: process.env.DEEPSEEK_API_KEY, baseURL: "https://api.deepseek.com" });
    const models = await deepseek.models.list();
    console.log(models.data.map(m => m.id).join("\n"));
  } catch (e: any) { console.error("DeepSeek Error:", e.message); }

  console.log("\n--- 🟠 Anthropic Available Models ---");
  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const models = await anthropic.models.list();
    console.log(models.data.map((m: any) => m.id).join("\n"));
  } catch (e: any) { console.error("Anthropic Error (or endpoint not supported on this SDK version):", e.message); }
}

checkModels();
