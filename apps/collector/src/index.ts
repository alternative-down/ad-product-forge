import FirecrawlApp from "@firecrawl/sdk";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

dotenv.config();

const API_KEY = process.env.FIRECRAWL_API_KEY;
const OUTPUT_DIR = process.env.OUTPUT_DIR || "./results";

if (!API_KEY) {
  console.error("❌ FIRECRAWL_API_KEY environment variable is not set");
  process.exit(1);
}

interface CollectionResult {
  timestamp: string;
  execution_id: string;
  initial_sources: string[];
  prompt: string;
  signals: Signal[];
  total_signals: number;
}

interface Signal {
  url: string;
  raw_content: string;
  context: {
    source_domain: string;
    discovered_at: string;
  };
}

async function runCollectionAgent(): Promise<void> {
  const app = new FirecrawlApp({ apiKey: API_KEY });

  const executionId = Date.now().toString();
  const timestamp = new Date().toISOString();

  // Initial sources to explore
  const initialSources = [
    "https://news.ycombinator.com/newest",
    "https://www.producthunt.com/products",
    "https://github.com/trending",
  ];

  // Basic prompt for the agent
  const prompt = `
You are a market research agent. Your task is to discover signals about:
1. User pain points and problems
2. Desired features in existing tools
3. Emerging market trends
4. Opportunities for SaaS solutions

Instructions:
- Start from the initial sources provided
- Explore related pages and discussions
- Look for keywords: "pain point", "wish there was", "need", "frustrated", "missing feature", "would be great if"
- Collect raw content and the source URL
- Discover at least 5 unique signals before stopping
- Provide context about where each signal came from

Return a structured list of discovered signals with URL and raw content.
  `;

  console.log("🚀 Starting Firecrawl Agent...");
  console.log(`📍 Execution ID: ${executionId}`);
  console.log(`📅 Timestamp: ${timestamp}`);
  console.log(`🔗 Initial sources: ${initialSources.length}`);
  console.log("");

  try {
    // Call Firecrawl Agent API
    const response = await app.runAgent(prompt, {
      urls: initialSources,
    });

    console.log("✅ Agent execution completed");
    console.log(`📊 Response status:`, response.success);

    // Extract signals from response
    const signals: Signal[] = [];

    // Parse agent output (response format depends on Firecrawl implementation)
    // For now, we'll structure the response data
    if (response && response.data) {
      const responseData = response.data as Record<string, unknown>;
      const crawledData = responseData.crawledData || responseData;

      // Extract signals from crawled data
      if (Array.isArray(crawledData)) {
        for (const item of crawledData) {
          const itemData = item as Record<string, unknown>;
          signals.push({
            url: (itemData.url as string) || "unknown",
            raw_content: (itemData.markdown as string) || (itemData.content as string) || "",
            context: {
              source_domain: extractDomain((itemData.url as string) || ""),
              discovered_at: timestamp,
            },
          });
        }
      }
    }

    // Create result object
    const result: CollectionResult = {
      timestamp,
      execution_id: executionId,
      initial_sources: initialSources,
      prompt,
      signals,
      total_signals: signals.length,
    };

    // Save to file with timestamp in name
    const dateStr = new Date().toISOString().replace(/[:.]/g, "-").split("T")[0];
    const timeStr = new Date().toISOString().split("T")[1].replace(/[:.]/g, "-").split("Z")[0];
    const filename = `collection_${dateStr}_${timeStr}_${executionId}.json`;
    const filepath = path.join(OUTPUT_DIR, filename);

    // Ensure output directory exists
    if (!fs.existsSync(OUTPUT_DIR)) {
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    // Write result to file
    fs.writeFileSync(filepath, JSON.stringify(result, null, 2));

    console.log("");
    console.log("📁 Results saved to:", filepath);
    console.log(`📊 Total signals collected: ${result.total_signals}`);
    console.log("");
    console.log("✨ Collection phase validated successfully!");
  } catch (error) {
    if (error instanceof Error) {
      console.error("❌ Error running agent:", error.message);
    } else {
      console.error("❌ Unknown error:", error);
    }
    process.exit(1);
  }
}

// Helper function to extract domain from URL
function extractDomain(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch {
    return "unknown";
  }
}

// Run the agent
runCollectionAgent();
