import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";

const GEMINI_MODELS = ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-1.5-pro"] as const;

function getGenAI() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured");
  return new GoogleGenerativeAI(apiKey);
}

function convertToGeminiSchema(schema: any): any {
  if (!schema || typeof schema !== "object") return undefined;

  const convert = (node: any): any => {
    if (!node || typeof node !== "object") return node;

    if (node.$ref && node.definitions) {
      const refName = node.$ref.replace("#/definitions/", "");
      if (node.definitions[refName]) {
        return convert(node.definitions[refName]);
      }
    }

    const result: any = {};

    if (node.type === "object") {
      result.type = SchemaType.OBJECT;
      if (node.properties) {
        result.properties = {};
        for (const [key, val] of Object.entries(node.properties) as any) {
          if (val.$ref && node.definitions) {
            const refName = val.$ref.replace("#/definitions/", "");
            result.properties[key] = convert(node.definitions[refName]);
          } else {
            result.properties[key] = convert(val);
          }
        }
      }
      if (node.required) result.required = node.required;
    } else if (node.type === "array") {
      result.type = SchemaType.ARRAY;
      if (node.items) {
        if (node.items.$ref && node.definitions) {
          const refName = node.items.$ref.replace("#/definitions/", "");
          result.items = convert(node.definitions[refName]);
        } else {
          result.items = convert(node.items);
        }
      }
    } else if (node.type === "string") {
      result.type = SchemaType.STRING;
    } else if (node.type === "number") {
      result.type = SchemaType.NUMBER;
    } else if (node.type === "integer") {
      result.type = SchemaType.INTEGER;
    } else if (node.type === "boolean") {
      result.type = SchemaType.BOOLEAN;
    } else {
      return node;
    }

    return result;
  };

  let root = schema;
  if (schema.$ref && schema.definitions) {
    const refName = schema.$ref.replace("#/definitions/", "");
    root = { ...schema.definitions[refName], definitions: schema.definitions };
  }

  const converted = convert(root);
  return converted;
}

async function tryGeminiModel(
  modelName: string,
  systemPrompt: string,
  userPrompt: string,
  expectedSchema?: any
): Promise<string> {
  const genAI = getGenAI();

  const generationConfig: any = {};
  if (expectedSchema) {
    generationConfig.responseMimeType = "application/json";
    generationConfig.responseSchema = convertToGeminiSchema(expectedSchema);
  }

  const model = genAI.getGenerativeModel({
    model: modelName,
    ...(Object.keys(generationConfig).length > 0 ? { generationConfig } : {}),
  });

  const prompt = `${systemPrompt}\n\n${userPrompt}`;
  const result = await model.generateContent(prompt);
  const text = result.response.text();
  if (!text || text.trim().length === 0) {
    throw new Error(`${modelName} returned empty response`);
  }
  return text;
}

export async function generateWithFallback(
  systemPrompt: string,
  userPrompt: string,
  expectedSchema?: any
): Promise<string> {
  try {
    return await tryGeminiModel(GEMINI_MODELS[0], systemPrompt, userPrompt, expectedSchema);
  } catch (error: any) {
    console.error("2.5-Flash failed:", error);
    console.warn("2.5-Flash exhausted, falling back to 2.5-Pro...");
  }

  try {
    return await tryGeminiModel(GEMINI_MODELS[1], systemPrompt, userPrompt, expectedSchema);
  } catch (error: any) {
    console.error("2.5-Pro failed:", error);
    console.warn("2.5-Pro exhausted, falling back to 1.5-Pro...");
  }

  try {
    return await tryGeminiModel(GEMINI_MODELS[2], systemPrompt, userPrompt, expectedSchema);
  } catch (error: any) {
    console.error("1.5-Pro failed:", error);
  }

  throw new Error("All Gemini free-tier quotas are temporarily exhausted. Please wait 60 seconds.");
}
