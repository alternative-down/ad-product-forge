import { createTool } from '@mastra/core/tools';
import Firecrawl from '@mendable/firecrawl-js';
import { z } from 'zod';

export const marketResearchTool = createTool({
  id: 'market_research',
  description: 'Search the web for market signals, user pain points, and product opportunities using Firecrawl.',
  inputSchema: z.object({
    customPrompt: z.string().optional().describe('Custom research prompt to override the default market research strategy'),
  }),
  outputSchema: z.object({
    signals: z.array(
      z.object({
        title: z.string().describe('Title or headline of the signal'),
        description: z.string().describe('Description of the problem, pain point, or opportunity'),
        source: z.string().describe('Where was this signal found (website, forum, etc)'),
        type: z.enum(['pain_point', 'feature_request', 'trend', 'opportunity']).describe('Type of signal'),
        severity: z.enum(['low', 'medium', 'high']).describe('How urgent or severe is this signal'),
      })
    ),
    creditsUsed: z.number().optional(),
    status: z.string().optional(),
  }),
  execute: async (input) => {
    const API_KEY = process.env.FIRECRAWL_API_KEY;

    if (!API_KEY) {
      throw new Error('FIRECRAWL_API_KEY environment variable is not set');
    }

    const firecrawl = new Firecrawl({ apiKey: API_KEY });

    const defaultPrompt = `You are a market research agent specialized in discovering product opportunities.

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

Extract at least 8-10 unique signals from accessible sources. For each signal:
- Provide a clear title/headline
- Describe the problem/pain/opportunity
- Identify the source/context where you found it
- Classify the type (pain_point, feature_request, trend, opportunity)
- Assess severity (low, medium, high)

Focus on authentic signals from real users, not marketing hype. Prioritize signals that suggest real market demand.`;

    const prompt = input.customPrompt || defaultPrompt;

    const response = (await firecrawl.agent({
      prompt,
      schema: z.object({
        signals: z.array(
          z.object({
            title: z.string(),
            description: z.string(),
            source: z.string(),
            type: z.enum(['pain_point', 'feature_request', 'trend', 'opportunity']),
            severity: z.enum(['low', 'medium', 'high']),
          })
        ),
      }),
    })) as any;

    if (!response.success && response.status !== 'completed') {
      throw new Error(`Firecrawl agent failed with status: ${response.status}`);
    }

    return {
      signals: response.data?.signals || [],
      creditsUsed: response.creditsUsed,
      status: response.status,
    };
  },
});
