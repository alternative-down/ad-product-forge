# Collector App — Firecrawl Agent for Phase 1 (Active Collection)

Active market research agent powered by Firecrawl.

## Purpose

Implements **Phase 1: Coleta de Sinais** from the PRD.

- Uses Firecrawl Agent to actively discover signals from the web
- Explores initial sources and discovers related pages
- Collects raw content + context
- Saves results to JSON with timestamp

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

Create `.env` file:

```bash
cp .env.example .env
```

Set your Firecrawl API key:

```
FIRECRAWL_API_KEY=your-key-here
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

Results are saved to `results/` directory with filename:

```
collection_YYYY-MM-DD_HH-MM-SS-mmm_<executionId>.json
```

Example output:

```json
{
  "timestamp": "2026-03-07T11:55:00.000Z",
  "execution_id": "1741000500000",
  "initial_sources": [
    "https://news.ycombinator.com/newest",
    "https://www.producthunt.com/products",
    "https://github.com/trending"
  ],
  "prompt": "You are a market research agent...",
  "signals": [
    {
      "url": "https://example.com/article",
      "raw_content": "...",
      "context": {
        "source_domain": "example.com",
        "discovered_at": "2026-03-07T11:55:00.000Z"
      }
    }
  ],
  "total_signals": 5
}
```

## Schema (Phase 1 Validation)

Matches the minimum schema from PRD:

- `timestamp` ✅
- `content` (raw_content) ✅
- `link` (url) ✅
- `context` ✅

## Next Steps

- [ ] Add multiple initial source sets
- [ ] Implement deduplication logic
- [ ] Add database persistence (instead of just JSON files)
- [ ] Create message queue job for async processing
- [ ] Integrate with Neo4j for enrichment (Phase 2)

## Status

🚀 Phase 1 Validation (MVP)
