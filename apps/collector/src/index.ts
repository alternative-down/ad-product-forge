import Firecrawl from "@mendable/firecrawl-js";
import { z } from "zod";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

const API_KEY = process.env.FIRECRAWL_API_KEY;
const OUTPUT_DIR = process.env.OUTPUT_DIR || "./results";

if (!API_KEY) {
  console.error("❌ FIRECRAWL_API_KEY environment variable is not set");
  process.exit(1);
}

// Define schema for structured extraction of market signals
const SignalSchema = z.object({
  signals: z
    .array(
      z.object({
        title: z.string().describe("Title or headline of the signal"),
        description: z
          .string()
          .describe("Description of the problem, pain point, or opportunity"),
        source: z
          .string()
          .describe("Where was this signal found (website, forum, etc)"),
        type: z
          .enum(["pain_point", "feature_request", "trend", "opportunity"])
          .describe("Type of signal"),
        severity: z
          .enum(["low", "medium", "high"])
          .describe("How urgent or severe is this signal"),
      })
    )
    .describe("List of market signals discovered"),
});

type Signal = z.infer<typeof SignalSchema>["signals"][number];
type SignalResponse = z.infer<typeof SignalSchema>;

interface CollectionResult {
  timestamp: string;
  execution_id: string;
  prompt: string;
  signals: Signal[];
  total_signals: number;
  credits_used: number | null;
}

async function runCollectionAgent(): Promise<void> {
  const firecrawl = new Firecrawl({ apiKey: API_KEY });

  const executionId = Date.now().toString();
  const timestamp = new Date().toISOString();

  const prompt = buildMarketResearchPrompt();

  console.log("🚀 Starting Firecrawl Deep Research...");
  console.log(`📍 Execution ID: ${executionId}`);
  console.log(`📅 Timestamp: ${timestamp}`);
  console.log("");
  console.log("🔎 Searching for market signals...");
  console.log("");

  try {
    const response = await (firecrawl as any).deepResearch(prompt);

    console.log("✅ Deep research execution completed");
    console.log(`📊 Status: ${response.status ?? "unknown"}`);
    console.log(`💳 Credits used: ${response.creditsUsed ?? "N/A"}`);

    const signals = extractSignals(response);
    console.log(`📈 Signals extracted: ${signals.length}`);

    const result = createResult(executionId, timestamp, prompt, signals, response.creditsUsed);
    saveResults(result);
    displaySummary(signals);

    console.log("");
    console.log("✨ Phase 1 Validation successful!");
    console.log("");
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("❌ Error running deep research:", errorMessage);
    process.exit(1);
  }
}

function buildMarketResearchPrompt(): string {
  return `You are a market research agent specialized in discovering product opportunities.

Your task is to search the web for market signals about:
1. User pain points and problems (what frustrates users?)
2. Desired features (what do users wish existed?)
3. Emerging market trends (what's new and gaining traction?)
4. Market gaps and opportunities (where are problems not being solved?)

Search strategy:
- Look for discussions in forums, communities, and social platforms
- Find feature requests on existing products
- Discover emerging technologies and their use cases
- Identify recurring complaints and frustrations

Specific keywords to search for:
- "pain point", "frustrated with", "wish there was", "need a tool for"
- "missing feature", "would be great if", "can't find a solution for"
- "alternative to", "better than", "integration needed"
- "spending too much time on", "manual process", "workflow bottleneck"

IMPORTANT ACCESS POLICY:
- Do NOT attempt to bypass, circumvent, or work around access restrictions on websites
- Do NOT try multiple techniques to access restricted content (VPN, proxies, headers, etc)
- If a website blocks your access, STOP immediately and move to the next source
- Maximum 2 attempts per website/source - if access fails twice, move on
- Respect all robots.txt, rate limits, and access policies
- Focus on publicly accessible content only

Extract at least 8-10 unique signals from accessible sources. For each signal:
- Provide a clear title/headline
- Describe the problem/pain/opportunity
- Identify the source/context where you found it
- Classify the type (pain_point, feature_request, trend, opportunity)
- Assess severity (low, medium, high)

Focus on authentic signals from real users, not marketing hype. Prioritize signals that suggest real market demand.`;
}

function extractSignals(response: any): Signal[] {
  if (response.status === "completed" && response.data) {
    const parsed = response.data as SignalResponse;
    return parsed.signals ?? [];
  }

  console.warn(
    `⚠️  Research status: ${response.status}. No data available.`
  );
  return [];
}

function createResult(
  executionId: string,
  timestamp: string,
  prompt: string,
  signals: Signal[],
  creditsUsed: number | undefined
): CollectionResult {
  return {
    timestamp,
    execution_id: executionId,
    prompt,
    signals,
    total_signals: signals.length,
    credits_used: creditsUsed ?? null,
  };
}

function saveResults(result: CollectionResult): void {
  const dateStr = new Date()
    .toISOString()
    .replace(/[:.]/g, "-")
    .split("T")[0];
  const timeStr = new Date()
    .toISOString()
    .split("T")[1]
    .replace(/[:.]/g, "-")
    .split("Z")[0];
  const filename = `collection_${dateStr}_${timeStr}_${result.execution_id}.json`;
  const filepath = path.join(OUTPUT_DIR, filename);

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  fs.writeFileSync(filepath, JSON.stringify(result, null, 2));

  console.log("");
  console.log("✅ Results saved!");
  console.log(`📁 File: ${filepath}`);
  console.log(`📊 Total signals: ${result.total_signals}`);
  console.log("");
}

function displaySummary(signals: Signal[]): void {
  if (signals.length === 0) return;

  console.log("📋 Signal Summary:");
  console.log("---");
  signals.slice(0, 5).forEach((signal, idx) => {
    console.log(
      `${idx + 1}. [${signal.type.toUpperCase()}] ${signal.title}`
    );
    console.log(`   Severity: ${signal.severity} | Source: ${signal.source}`);
  });

  if (signals.length > 5) {
    console.log(
      `... and ${signals.length - 5} more signals in the results file`
    );
  }
}

// Run the agent
runCollectionAgent();
