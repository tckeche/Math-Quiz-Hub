import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';

async function runDeepDiagnostics() {
  console.log("=== 🕵️‍♂️ CLAUDE API DEEP DIAGNOSTIC ===");

  try {
    const pkg = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
    console.log("📦 @anthropic-ai/sdk version:", pkg.dependencies['@anthropic-ai/sdk'] || "NOT FOUND");
  } catch (e) {
    console.log("Could not read package.json");
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("❌ NO API KEY FOUND IN ENVIRONMENT");
    return;
  }

  const modelToTest = "claude-sonnet-4-6";

  console.log(`\n--- 🧪 TEST 1: Official SDK (${modelToTest}) ---`);
  try {
    const anthropic = new Anthropic({ apiKey });
    const response = await anthropic.messages.create({
      model: modelToTest,
      max_tokens: 10,
      messages: [{ role: "user", content: "Reply with the word 'CONNECTED'" }]
    });
    const textBlock = response.content[0];
    console.log("✅ SDK SUCCESS:", textBlock.type === "text" ? textBlock.text : "no text");
  } catch (error: any) {
    console.error("❌ SDK FAILED.");
    console.error("Status Code:", error.status);
    console.error("Error Name:", error.name);
    console.error("Raw Error Object:", JSON.stringify(error.error || error.message, null, 2));
  }

  console.log(`\n--- 🌐 TEST 2: Raw HTTP Fetch (${modelToTest}) ---`);
  try {
    const fetchRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: modelToTest,
        max_tokens: 10,
        messages: [{ role: "user", content: "Reply with the word 'CONNECTED'" }]
      })
    });
    const data = await fetchRes.json();
    if (fetchRes.ok) {
      console.log("✅ RAW FETCH SUCCESS:", data.content[0].text);
    } else {
      console.error(`❌ RAW FETCH FAILED (HTTP ${fetchRes.status}):`);
      console.error(JSON.stringify(data, null, 2));
    }
  } catch (e: any) {
    console.error("❌ RAW FETCH NETWORK CRASH:", e.message);
  }
}

runDeepDiagnostics();
