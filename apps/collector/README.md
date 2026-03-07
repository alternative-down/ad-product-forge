# Collector App — Firecrawl Agent for Phase 1 (Active Collection)

Active market research agent powered by Firecrawl Agent API.

Implements **Phase 1: Coleta de Sinais** from the PRD using Firecrawl's autonomous agent to discover and extract market signals without needing to provide specific URLs upfront.

## Architecture

Uses Firecrawl `/agent` endpoint with:
- **Zod schema** for type-safe structured output
- **Spark 1 Mini model** (default, 60% cheaper than Pro)
- **Natural language prompt** to guide autonomous search
- **Dynamic credit-based pricing** with `maxCredits` limit

## Purpose

Autonomously discovers market signals:
- User pain points and problems
- Desired features (feature requests)
- Emerging market trends
- Market gaps and opportunities

Results saved to JSON with timestamp in filename for tracking.

## Setup

### 1. Install dependencies

```bash
npm install --ignore-scripts
```

### 2. Configure environment

Create `.env` file:

```bash
cp .env.example .env
```

Set your Firecrawl API key:

```
FIRECRAWL_API_KEY=fc-YOUR_KEY_HERE
OUTPUT_DIR=./results
```

Get API key: https://www.firecrawl.dev

### 3. Run

**Development:**

```bash
npm run dev
```

**Build:**

```bash
npm run build
npm run start
```

## Output Format

Results are saved to `results/` directory with filename pattern:

```
collection_YYYY-MM-DD_HH-MM-SS-mmm_<executionId>.json
```

Example output:

```json
{
  "timestamp": "2026-03-07T12:00:00.000Z",
  "execution_id": "1741000800000",
  "prompt": "You are a market research agent...",
  "model": "spark-1-mini",
  "signals": [
    {
      "title": "Backend developers struggle with database migration",
      "description": "Users report spending 40+ hours on manual database migrations, especially with schema changes",
      "source": "HackerNews - Ask HN thread",
      "type": "pain_point",
      "severity": "high"
    },
    {
      "title": "Need for better API rate limiting as a service",
      "description": "Feature request across multiple platforms for a standalone API rate limiting service",
      "source": "Product Hunt discussions, GitHub issues",
      "type": "feature_request",
      "severity": "medium"
    }
  ],
  "total_signals": 10,
  "credits_used": 245
}
```

## Schema

Structured extraction using Zod:

```typescript
signals: [
  {
    title: string,           // Headline of the signal
    description: string,     // Details about the problem/opportunity
    source: string,          // Where it was found
    type: "pain_point" | "feature_request" | "trend" | "opportunity",
    severity: "low" | "medium" | "high"
  }
]
```

**Matches PRD Phase 1 minimum fields:**
- `timestamp` ✅
- `content` (description + title) ✅
- `context` (source + type + severity) ✅

## How It Works

1. **Prompt-based search**: Agent receives natural language instructions (no URLs required)
2. **Autonomous exploration**: Firecrawl Agent autonomously searches the web
3. **Structured extraction**: Results extracted into defined schema (Zod)
4. **File persistence**: Results saved with execution metadata
5. **Credit-based billing**: Dynamic pricing based on complexity (~200-500 credits per run)

### Configuration

Key parameters in `index.ts`:

```typescript
const response = await firecrawl.agent({
  prompt,                    // Natural language instruction
  schema: SignalSchema,      // Zod schema for output
  model: "spark-1-mini",     // Model selection (mini = 60% cheaper)
  maxCredits: 500,           // Spend limit (default 2500)
});
```

**Model choices:**
- `spark-1-mini` (default): 60% cheaper, good for most tasks ✅
- `spark-1-pro`: Higher accuracy for complex research

## Status Codes

- `processing` - Agent is still working
- `completed` - Extraction finished successfully
- `failed` - An error occurred

## Free Credits

All users receive **5 free daily runs** from Firecrawl to test the agent.

## Next Steps

- [ ] Persist results to database (PostgreSQL/MongoDB) instead of JSON
- [ ] Create message queue job processor (BullMQ/Trigger)
- [ ] Implement deduplication logic
- [ ] Add filtering by signal quality/relevance
- [ ] Integrate with Neo4j for Phase 2 (enrichment)
- [ ] Create dashboard to visualize signals over time
- [ ] Implement async job polling with status endpoint

## Documentation

- Firecrawl Agent: https://docs.firecrawl.dev/features/agent
- Firecrawl Pricing: https://www.firecrawl.dev/pricing
- Play with Agent: https://www.firecrawl.dev/app/agent

## Status

🚀 **Phase 1 Validation (MVP)** - Firecrawl Agent integration complete
