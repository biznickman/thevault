import type {
  ExtractedFact,
  IntentClassification,
  IntentLabel,
  MemoryExtraction,
} from "@/lib/ai/types";
import type { MemberContext } from "@/lib/memory/types";

const openAiEndpoint = "https://api.openai.com/v1/chat/completions";
const openRouterEndpoint = "https://openrouter.ai/api/v1/chat/completions";
const openAiEmbeddingsEndpoint = "https://api.openai.com/v1/embeddings";
const openRouterEmbeddingsEndpoint = "https://openrouter.ai/api/v1/embeddings";

const classificationSystemPrompt = [
  "Classify a user's intent in response to a private invitation.",
  "Return JSON only with keys: label, confidence, rationale.",
  "Allowed labels: affirmative, negative, neutral, ambiguous.",
  "Use negative for opt-out or disinterest.",
  "Use affirmative for clear desire to continue.",
  "Use neutral for questions or statements without clear decision.",
  "Use ambiguous when mixed/conflicting intent.",
  "confidence must be 0 to 1.",
].join(" ");

const memoryExtractionPrompt = [
  "Extract durable member memory from conversation turns.",
  "Return JSON only with keys: summary, facts.",
  "summary must be 2-4 short sentences and include open loops if any.",
  "facts is an array of {category, fact, confidence}.",
  "Only include likely durable facts: location, interests, constraints, preferences, goals.",
  "Do not include one-off trivia.",
  "confidence must be 0 to 1.",
].join(" ");

const ellisReplyPrompt = [
  "You are Ellis, onboarding concierge for an invite-only social club.",
  "Reply as SMS, concise and warm, under 320 characters.",
  "Use provided memory context when relevant.",
  "Ask at most one clear follow-up question.",
  "If location is missing, prioritize asking for city.",
].join(" ");

interface ProviderSettings {
  endpoint: string;
  apiKey: string;
  model: string;
  headers?: Record<string, string>;
  embeddingsEndpoint: string;
  embeddingModel: string;
}

function getProviderSettings(): ProviderSettings | null {
  const provider = (process.env.AI_PROVIDER ?? "openai").toLowerCase();

  if (provider === "openrouter") {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return null;
    }

    return {
      endpoint: openRouterEndpoint,
      apiKey,
      model: process.env.OPENROUTER_MODEL ?? "openai/gpt-4.1-mini",
      embeddingsEndpoint: openRouterEmbeddingsEndpoint,
      embeddingModel:
        process.env.OPENROUTER_EMBEDDING_MODEL ?? "openai/text-embedding-3-small",
      headers: {
        "HTTP-Referer": process.env.OPENROUTER_SITE_URL ?? "https://thevault.local",
        "X-Title": "The Vault",
      },
    };
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return null;
  }

  return {
    endpoint: openAiEndpoint,
    apiKey,
    model: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
    embeddingsEndpoint: openAiEmbeddingsEndpoint,
    embeddingModel: process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small",
  };
}

function parseClassification(content: string): IntentClassification | null {
  try {
    const parsed = JSON.parse(content) as IntentClassification;
    const labels: IntentLabel[] = ["affirmative", "negative", "neutral", "ambiguous"];

    if (!labels.includes(parsed.label)) {
      return null;
    }

    if (typeof parsed.confidence !== "number") {
      return null;
    }

    return {
      label: parsed.label,
      confidence: Math.max(0, Math.min(1, parsed.confidence)),
      rationale: parsed.rationale,
    };
  } catch {
    return null;
  }
}

async function requestChatCompletion(params: {
  system: string;
  user: string;
  responseType: "json" | "text";
  temperature?: number;
  maxTokens?: number;
}): Promise<string | null> {
  const settings = getProviderSettings();
  if (!settings) {
    return null;
  }

  const response = await fetch(settings.endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${settings.apiKey}`,
      "Content-Type": "application/json",
      ...settings.headers,
    },
    body: JSON.stringify({
      model: settings.model,
      temperature: params.temperature ?? 0,
      max_tokens: params.maxTokens ?? 350,
      ...(params.responseType === "json"
        ? { response_format: { type: "json_object" as const } }
        : {}),
      messages: [
        { role: "system", content: params.system },
        { role: "user", content: params.user },
      ],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`AI request failed: ${response.status} ${text}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string | null } }>;
  };

  return data.choices?.[0]?.message?.content ?? null;
}

export async function classifyIntentWithModel(
  messageText: string,
): Promise<IntentClassification | null> {
  const content = await requestChatCompletion({
    system: classificationSystemPrompt,
    user: `Message: ${messageText}`,
    responseType: "json",
    temperature: 0,
    maxTokens: 120,
  });

  if (!content) {
    return null;
  }

  return parseClassification(content);
}

function normalizeExtractedFact(fact: ExtractedFact): ExtractedFact | null {
  if (!fact.category || !fact.fact) {
    return null;
  }

  return {
    category: String(fact.category).slice(0, 64),
    fact: String(fact.fact).trim().slice(0, 512),
    confidence: Math.max(0, Math.min(1, Number(fact.confidence ?? 0.7))),
  };
}

export async function extractMemoryFromConversation(
  messageTranscript: string,
): Promise<MemoryExtraction | null> {
  const content = await requestChatCompletion({
    system: memoryExtractionPrompt,
    user: messageTranscript,
    responseType: "json",
    temperature: 0,
    maxTokens: 600,
  });

  if (!content) {
    return null;
  }

  try {
    const parsed = JSON.parse(content) as MemoryExtraction;
    const facts = Array.isArray(parsed.facts)
      ? parsed.facts.map(normalizeExtractedFact).filter((fact): fact is ExtractedFact => Boolean(fact))
      : [];

    if (!parsed.summary || typeof parsed.summary !== "string") {
      return null;
    }

    return {
      summary: parsed.summary.trim().slice(0, 1200),
      facts,
    };
  } catch {
    return null;
  }
}

function hasLocationFact(context: MemberContext): boolean {
  const corpus = [
    context.summary ?? "",
    ...context.facts.map((fact) => `${fact.category} ${fact.fact}`),
  ]
    .join(" ")
    .toLowerCase();

  return ["city", "miami", "new york", "los angeles", "austin", "san francisco", "location"]
    .some((token) => corpus.includes(token));
}

export async function generateEllisReplyWithContext(params: {
  memberFirstName: string;
  incomingMessage: string;
  context: MemberContext;
  instructionPack?: string;
}): Promise<string | null> {
  const promptContext = {
    memberFirstName: params.memberFirstName,
    summary: params.context.summary,
    keyFacts: params.context.facts.slice(0, 6).map((fact) => ({
      category: fact.category,
      fact: fact.fact,
      confidence: fact.confidence,
    })),
    recentTurns: params.context.recentTurns.slice(-8),
    incomingMessage: params.incomingMessage,
    locationKnown: hasLocationFact(params.context),
  };

  const content = await requestChatCompletion({
    system: [params.instructionPack ?? "", ellisReplyPrompt].filter(Boolean).join("\n\n"),
    user: JSON.stringify(promptContext),
    responseType: "text",
    temperature: 0.3,
    maxTokens: 180,
  });

  if (!content) {
    return null;
  }

  return content.trim();
}

export async function embedTexts(inputs: string[]): Promise<number[][] | null> {
  const settings = getProviderSettings();
  if (!settings || inputs.length === 0) {
    return null;
  }

  const response = await fetch(settings.embeddingsEndpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${settings.apiKey}`,
      "Content-Type": "application/json",
      ...settings.headers,
    },
    body: JSON.stringify({
      model: settings.embeddingModel,
      input: inputs,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Embedding request failed: ${response.status} ${text}`);
  }

  const data = (await response.json()) as {
    data?: Array<{ embedding?: number[] }>;
  };

  if (!data.data) {
    return null;
  }

  return data.data.map((item) => item.embedding ?? []);
}

export async function embedText(input: string): Promise<number[] | null> {
  const vectors = await embedTexts([input]);
  return vectors?.[0] ?? null;
}
