# PRD 17: Social Media & Community Integration

**Status:** Draft - Detailed Analysis and Planning
**Data:** 2026-03-15
**Versão:** 1.0
**Responsável:** Agent Engagement & Platform Integration Team

---

## Resumo Executivo

### Objetivo Principal
Habilitar agentes a promover suas criações, identificar oportunidades de interação comunitária e se engajar em plataformas de mídia social e fóruns de comunidade. Sistema deve permitir agentes publicar conteúdo, compartilhar trabalho, monitorar menções e capturar leads/oportunidades de forma autônoma e segura.

### Proposta de Valor
1. **Expansão de Reach:** Agentes podem alcançar audiências além do sistema interno
2. **Oportunidade Identification:** Sistema identifica automaticamente leads, parcerias e engagement oportunidades
3. **Brand Amplification:** Trabalho de agentes é promovido em canais com alta visibilidade
4. **Community Engagement:** Agentes podem participar de discussões e construir reputação
5. **Data Enrichment:** Feedback e interações comunitárias alimentam melhorias de agentes

### Proposta de Valor Técnico
1. **Multi-Platform Support:** Integração abstrata com N plataformas (Twitter, LinkedIn, Discord, Reddit, Slack, etc)
2. **Content Scheduling:** Publicação programada de criações de agentes
3. **Opportunity Detection:** ML/heurística para identificar oportunidades relevantes
4. **Reputation Tracking:** Monitorar engagement, menções, feedback de cada agente
5. **Compliance & Safety:** Validação de conteúdo antes de publicação, rastreamento de publicações

### Escopo da Feature

#### Incluso (MVP - Phase 1)
- Integração com plataformas principais: Twitter, LinkedIn, Reddit
- Integração com comunidades internas: Discord, Slack (workspaces)
- Publishing workflow: Agentes publicam trabalho via tools
- Content scheduling: Fila de publicações com data/hora
- Mention detection: Monitorar menções do agente em feeds
- Basic analytics: Contagem de views, shares, replies
- Content validation: Checklist antes de publicar (length, sensitivity, legal)
- Feed monitoring: Coleta de tendências/tópicos por comunidade

#### Não está no Escopo (Phase 2+)
- ML-powered opportunity scoring (Phase 2)
- Sentiment analysis de replies (Phase 2)
- Automated response to mentions (Phase 2+)
- Advanced scheduling (recurring posts, A/B testing)
- Full social listening (advanced keyword tracking)
- Cross-platform analytics dashboard
- Influencer identification
- Competitor monitoring
- Integration com TikTok, Instagram, YouTube (requer human approval)

---

## 2. Contexto Técnico Atual

### Arquitetura Existente

#### Agent Capabilities (v1 - sem social media)
```
Agent Runtime
├─ Tools (hardcoded)
│  ├─ Communication Tools (email, discord, slack)
│  ├─ Data Tools (database, file operations)
│  ├─ Analysis Tools (data processing)
│  └─ NO social media tools
├─ Knowledge Base
├─ Long-term Memory
└─ Specialized Functions
```

#### Problema Identificado
1. **Sem integração social:** Agentes não podem publicar ou monitorar presença
2. **Sem lead generation:** Oportunidades em communities são perdidas
3. **Sem feedback loop:** Comunidade não pode influenciar agentes
4. **Sem compliance:** Sem validação de conteúdo antes de publicar
5. **Sem scheduling:** Publicações são imediatas, sem planejamento

### Stack Técnico Atual
- **Runtime:** Node.js + TypeScript
- **Agent Framework:** Custom framework (Mastra)
- **Database:** LibSQL (SQLite-compatible)
- **Communication:** Email, Discord, Slack providers
- **Autenticação:** JWT (interno), OAuth (para provedores)

### Dependências Existentes
- `@libsql/client` — Database client
- `zod` — Schema validation
- `axios` / `node-fetch` — HTTP requests
- Provider integrations (Discord.js, Slack SDK, email clients)

---

## 3. Requisitos Funcionais

### 3.1 Social Media Platform Integration

**RF-1: Abstração de plataforma social**
- Interface genérica `SocialPlatform` implementada por cada platform
- Operações básicas: `publish()`, `getPost()`, `searchMentions()`, `getFeed()`
- Cada plataforma implementa SDK específico (Tweepy/twitter-api para Twitter, etc)
- Suportar inicialização de múltiplas contas por plataforma

**RF-2: Twitter/X integration**
- Publicar tweets (text + media)
- Monitorar menções usando API v2
- Buscar tweets com keywords relacionados ao agente
- Retweet/like de conteúdo relevante (condicional)
- Rate limiting respeitado (300 tweets/hour)
- Suportar múltiplas contas de Twitter por agente

**RF-3: LinkedIn integration**
- Publicar posts (text + article links + document uploads)
- Monitorar comentários em posts do agente
- Buscar posts com keywords (dentro da rede)
- Seguir usuários/empresas relevantes
- Rate limiting respeitado (LinkedIn API limits)

**RF-4: Reddit integration**
- Postar em subreddits específicos (text + links)
- Monitorar respostas a posts
- Buscar posts/comments com keywords em subreddits
- Upvote/participate em discussões relevantes
- Suportar múltiplas contas com different posting personas

**RF-5: Community platforms (Discord, Slack)**
- Publicar mensagens em channels específicos (já integrado)
- Monitorar mentions em todos os canais
- Detectar keywords de oportunidade
- Participar em thread discussions
- Integração bidirecional com Communication Module

### 3.2 Content Publishing & Scheduling

**RF-6: Publishing workflow**
```typescript
interface PublishRequest {
  agentId: string;
  platforms: ('twitter' | 'linkedin' | 'reddit' | 'discord' | 'slack')[];
  content: {
    title?: string;           // Para LinkedIn articles
    text: string;             // Main content (280-300 chars for Twitter)
    mediaUrls?: string[];     // URLs de imagens/vídeos
    links?: string[];         // Links para compartilhar
    hashtags?: string[];      // Only for Twitter/LinkedIn
    targetAudience?: string;  // Para seleção de subreddit/channel
  };
  scheduledAt?: Date;         // Se não definido, publica imediatamente
  expiresAt?: Date;          // Remover post após esta data (opcional)
  metadata?: Record<string, unknown>;
}
```

**RF-7: Content validation before publishing**
- Verificação de length (Twitter 280 chars, LinkedIn 500+)
- Detecção de conteúdo sensível (profanity, hate speech, etc)
- Validação de links (não quebrados, não maliciosos)
- Verificação de compliance (GDPR, advertência legal)
- Preview de como vai parecer em cada platform
- Human approval workflow (para conteúdo crítico)

**RF-8: Scheduling engine**
- Fila de publicações pendentes
- Execução em data/hora especificada
- Retry logic (se falhar, tenta 3x com backoff)
- Handling de timezone (agentes podem estar em timezones diferentes)
- Cancelamento de posts agendados

**RF-9: Multi-platform publishing**
- Publicar mesmo conteúdo em múltiplas platforms com adaptação
  - Twitter: Truncate a 280 chars, adicionar URL
  - LinkedIn: Versão extendida + links
  - Reddit: Subreddit-specific, pode usar full text
- Tracking de post_ids em cada platform
- Unified publishing status (sucesso/falha por platform)

### 3.3 Mention & Opportunity Detection

**RF-10: Mention monitoring**
- Monitorar menções de agente em tempo real (ou a cada 5 min)
- Suportar keywords customizados (nome do agente + synonyms)
- Rastrear quem mencionou (user, account, timestamp)
- Capturar contexto (qual post/thread originou menção)
- Notificar agente de menções (via internal notification)

**RF-11: Opportunity identification (heurística)**
- Identificar posts/comments com intent de colaboração
  - Palavras-chave: "partnership", "collaborate", "hire", "integration", etc
  - Tone analysis: Positive feedback, questions, requests
- Identificar discussion tópicos relevantes ao agente
  - Match com agent skills/interests
  - Capture question patterns agent pode responder
- Score opportunity (high/medium/low based on heuristics)
- Return: Structured list com { user, opportunity_type, relevance_score, context }

**RF-12: Feed monitoring**
- Periodicamente fetch feed de communities (subreddits, Discord channels)
- Extract posts/comments with keywords
- Group by topic/trend
- Return para agente: trending topics, discussion patterns
- Cache de feed para evitar re-fetch contínuo

### 3.4 Agent Autonomy & Response

**RF-13: Autonomous publishing**
- Agente pode usar tool `publishContent()` para publicar
- Tool valida conteúdo antes de submit
- Tool pode agendar publicação para later
- Tool retorna post_id e link para cada platform
- Tool pode incluir analytics (preview de engagement)

**RF-14: Autonomous response trigger (v1 - manual trigger)**
- Agente pode usar tool `respondToMention()` para responder
- Tool valida resposta (length, tone)
- Tool publica resposta em platform correto
- Tool rastreia reply chain (linking mention to response)

**RF-15: Scheduled content creation**
- Agente pode programar publicações recorrentes
  - Daily standup, weekly summary, monthly report
  - Agent fornece "template" + vars dinamicamente
  - Sistema executa em schedule (via cron)

### 3.5 Analytics & Tracking

**RF-16: Post analytics**
- Rastrear para cada post:
  - Platform + post_id
  - Timestamp de publicação
  - Views/impressions (se suportado pela platform)
  - Likes/reactions
  - Comments/replies
  - Shares/retweets
  - Click-through rate (se link tracking)
- Aggragate por agente (total engagement, growth trend)

**RF-17: Mention/engagement tracking**
- Rastrear menções (quem, quando, onde, contexto)
- Rastrear replies (quem respondeu, sentimento simples: positive/neutral/negative)
- Link com posts do agente (resposta a qual post?)
- Metrics: response rate, average response time, sentiment ratio

**RF-18: Reputation scoring (v1 - simples)**
- Score por platform (0-100)
- Baseado em: post count, engagement rate, mention frequency
- Trend (going up/down/stable)
- Benchmark contra average agent

### 3.6 Safety & Compliance

**RF-19: Content moderation**
- Pre-publish checks:
  - Toxicity detection (via API ou model)
  - Spam detection
  - GDPR compliance (no PII in public posts)
  - URL validation (not phishing, not malware)
- Log de todo conteúdo publicado (para auditoria)
- Ability to delete/edit posts (if platform supports)

**RF-20: Rate limiting & quota management**
- Respeitar API limits de cada platform (Twitter 300/hour, etc)
- Quota por agente (max 10 posts/dia, configurable)
- Throttle requests para não exceder platform limits
- Alert se agente está quebrando quotas

**RF-21: Authentication & credentials**
- Securely store API keys/tokens para cada platform (via Provider Config System)
- OAuth flow para platforms que suportam (Twitter API v2, LinkedIn, etc)
- Token refresh automaticamente (se refresh_token disponível)
- Revoke access se credenciais comprometidas

---

## 4. Requisitos Não-Funcionais

### 4.1 Performance
- **RNF-1:** Publicação de post < 2 segundos (end-to-end)
- **RNF-2:** Mention detection < 5 segundos (fetch + parse)
- **RNF-3:** Feed monitoring < 10 segundos (fetch + process)
- **RNF-4:** Analytics aggregation < 30 segundos (1000+ posts)
- **RNF-5:** Opportunity scoring < 1 segundo (parallelizable)

### 4.2 Scalability
- **RNF-6:** Suportar 100+ agentes publicando simultaneamente
- **RNF-7:** Monitorar 10000+ mentions/dia sem degradação
- **RNF-8:** Feed caching para evitar re-fetch redundante
- **RNF-9:** Queue-based scheduling (worker pool) para publicações agendadas

### 4.3 Reliability
- **RNF-10:** Retry logic com exponential backoff (max 3 retries)
- **RNF-11:** Idempotent publishing (não duplicar posts em falha)
- **RNF-12:** Graceful degradation (se 1 platform falha, outros continuam)
- **RNF-13:** Circuit breaker para platforms com problemas recorrentes

### 4.4 Security
- **RNF-14:** Chave API armazenada criptografada (via Provider Config)
- **RNF-15:** Logging seguro (nunca logar API keys ou tokens)
- **RNF-16:** Rate limiting para evitar abuse (DDoS protection)
- **RNF-17:** Validação de URLs (prevent malware sharing)

### 4.5 Auditoria
- **RNF-18:** Log de todo publicação (who, what, when, where, result)
- **RNF-19:** Rastrear edits/deletes de posts
- **RNF-20:** Compliance log (GDPR, content moderation decisions)

### 4.6 Maintenance
- **RNF-21:** Platform SDKs versionados (easy to upgrade)
- **RNF-22:** Fallback para rate-limit exceeded (queue + retry)
- **RNF-23:** Health checks para platform connectivity

---

## 5. Arquitetura da Solução

### 5.1 Data Model & Schema

```sql
-- Configurações de plataforma social por agente
CREATE TABLE social_platform_configs (
  id TEXT PRIMARY KEY,                    -- uuid
  agent_id TEXT NOT NULL,
  platform_type TEXT NOT NULL,            -- 'twitter', 'linkedin', 'reddit', 'discord', 'slack'
  account_handle TEXT,                    -- @username, /r/subreddit, etc

  config_json TEXT,                       -- Platform-specific config (channel_id, subreddit, etc)
  status TEXT NOT NULL,                   -- 'active', 'inactive', 'suspended'

  -- OAuth/token info (stored via provider config system)
  provider_config_id TEXT,                -- FK to provider_configurations

  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  UNIQUE (agent_id, platform_type, account_handle),
  INDEX idx_agent_id (agent_id),
  INDEX idx_platform_type (platform_type)
);

-- Posts publicados por agentes
CREATE TABLE social_posts (
  id TEXT PRIMARY KEY,                    -- uuid
  agent_id TEXT NOT NULL,
  platform_config_id TEXT NOT NULL,       -- FK to social_platform_configs

  -- Post content
  title TEXT,                             -- LinkedIn articles
  content TEXT NOT NULL,                  -- Main text
  media_urls TEXT,                        -- JSON array de URLs
  links TEXT,                             -- JSON array de links
  hashtags TEXT,                          -- JSON array

  -- Publishing
  published_at TIMESTAMP,
  scheduled_at TIMESTAMP,
  published_result TEXT,                  -- 'success', 'failed', 'pending'

  -- Platform-specific post ID
  platform_post_id TEXT,                  -- tweet_id, post_id, etc
  platform_post_url TEXT,

  -- Metadata
  content_hash TEXT,                      -- Para deduplicação
  metadata_json TEXT,                     -- Custom metadata

  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_agent_id (agent_id),
  INDEX idx_platform_config_id (platform_config_id),
  INDEX idx_published_at (published_at),
  INDEX idx_status (published_result)
);

-- Analytics de posts
CREATE TABLE social_post_analytics (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL,                  -- FK to social_posts

  platform_type TEXT NOT NULL,

  -- Metrics
  views INTEGER DEFAULT 0,
  likes INTEGER DEFAULT 0,
  comments INTEGER DEFAULT 0,
  shares INTEGER DEFAULT 0,
  retweets INTEGER DEFAULT 0,             -- Twitter
  engagements INTEGER DEFAULT 0,
  click_through_count INTEGER DEFAULT 0,

  -- Ratios
  engagement_rate REAL,                   -- (engagement / views)

  -- Time series
  fetched_at TIMESTAMP NOT NULL,

  INDEX idx_post_id (post_id),
  INDEX idx_platform_type (platform_type),
  INDEX idx_fetched_at (fetched_at)
);

-- Menções e opportunities detectadas
CREATE TABLE social_mentions (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,

  platform_type TEXT NOT NULL,
  platform_post_id TEXT,                  -- ID do post que mencionou
  platform_post_url TEXT,

  -- Quem mencionou
  mentioned_by_username TEXT,
  mentioned_by_user_id TEXT,

  -- Contexto
  mention_text TEXT,                      -- O conteúdo que mencionou
  mention_type TEXT,                      -- 'mention', 'reply', 'quote', 'conversation'

  -- Oportunidade (v1 - heurística simples)
  is_opportunity BOOLEAN DEFAULT FALSE,
  opportunity_type TEXT,                  -- 'partnership', 'feedback', 'lead', 'question'
  opportunity_score REAL,                 -- 0.0 - 1.0

  -- Response tracking
  responded_at TIMESTAMP,
  response_post_id TEXT,                  -- FK to social_posts (our response)

  mentioned_at TIMESTAMP NOT NULL,
  detected_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_agent_id (agent_id),
  INDEX idx_platform_type (platform_type),
  INDEX idx_is_opportunity (is_opportunity),
  INDEX idx_mentioned_at (mentioned_at)
);

-- Feed monitoring (trending topics, discussions)
CREATE TABLE social_feed_monitoring (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,

  platform_type TEXT NOT NULL,
  platform_location TEXT,                 -- subreddit, channel_id, etc

  -- Topic
  keyword TEXT NOT NULL,

  -- Collected data
  post_count INTEGER,
  engagement_total INTEGER,
  trend_direction TEXT,                   -- 'trending_up', 'stable', 'trending_down'

  -- Time series
  monitored_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_agent_id (agent_id),
  INDEX idx_platform_type (platform_type),
  INDEX idx_keyword (keyword),
  INDEX idx_monitored_at (monitored_at)
);

-- Audit log
CREATE TABLE social_audit_log (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,

  action TEXT NOT NULL,                   -- 'publish', 'schedule', 'delete', 'respond', etc
  resource_type TEXT,                     -- 'post', 'mention', 'feed'
  resource_id TEXT,

  platform_type TEXT,

  details_json TEXT,                      -- Full details

  result TEXT NOT NULL,                   -- 'success', 'failed'
  error_message TEXT,

  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_agent_id (agent_id),
  INDEX idx_action (action),
  INDEX idx_created_at (created_at)
);
```

### 5.2 Platform Abstraction Layer

```typescript
// packages/mastra-engine/src/agent/social/platform.ts

export interface SocialPlatformConfig {
  providerId: string;
  platformType: 'twitter' | 'linkedin' | 'reddit' | 'discord' | 'slack';
  accountHandle?: string;
  customConfig?: Record<string, unknown>;
}

export interface PublishOptions {
  content: string;
  title?: string;
  mediaUrls?: string[];
  links?: string[];
  hashtags?: string[];
  scheduledAt?: Date;
}

export interface PostMetrics {
  views?: number;
  likes: number;
  comments: number;
  shares: number;
  engagementRate: number;
  fetchedAt: Date;
}

export interface Mention {
  id: string;
  username: string;
  userId: string;
  text: string;
  mentionType: 'mention' | 'reply' | 'quote';
  url: string;
  mentionedAt: Date;
}

export interface Opportunity {
  mentionId: string;
  type: 'partnership' | 'feedback' | 'lead' | 'question';
  relevanceScore: number;
  context: string;
}

export abstract class SocialPlatform {
  abstract publish(options: PublishOptions): Promise<{
    postId: string;
    url: string;
  }>;

  abstract getPost(postId: string): Promise<{
    id: string;
    content: string;
    metrics: PostMetrics;
  }>;

  abstract searchMentions(keywords: string[]): Promise<Mention[]>;

  abstract getFeed(keywords: string[], limit?: number): Promise<{
    posts: unknown[];
    trends: string[];
  }>;

  abstract detectOpportunities(mentions: Mention[]): Promise<Opportunity[]>;

  abstract respond(
    mentionId: string,
    response: string
  ): Promise<{ postId: string; url: string }>;

  abstract validateContent(content: string): Promise<{
    valid: boolean;
    issues: string[];
  }>;
}
```

### 5.3 Platform Implementations

```typescript
// packages/mastra-engine/src/agent/social/twitter-platform.ts

import { Tweeter } from 'twitter-api-v2';

export class TwitterPlatform extends SocialPlatform {
  private client: Tweeter;

  constructor(bearerToken: string) {
    this.client = new Tweeter({ bearerToken });
  }

  async publish(options: PublishOptions): Promise<{ postId: string; url: string }> {
    // Validate length (280 chars max)
    if (options.content.length > 280) {
      throw new Error('Twitter posts must be <= 280 characters');
    }

    try {
      const tweet = await this.client.v2.tweet(options.content);
      return {
        postId: tweet.data.id,
        url: `https://twitter.com/user/status/${tweet.data.id}`,
      };
    } catch (error) {
      throw new Error(`Twitter publish failed: ${error.message}`);
    }
  }

  async searchMentions(keywords: string[]): Promise<Mention[]> {
    // Use Twitter Search API v2
    const query = keywords.map((k) => `@${k}`).join(' OR ');
    const tweets = await this.client.v2.search(query, {
      max_results: 100,
      'tweet.fields': 'created_at,author_id',
      'user.fields': 'username',
    });

    return tweets.data?.map((tweet: unknown) => ({
      id: tweet.id,
      username: tweet.author.username,
      userId: tweet.author_id,
      text: tweet.text,
      mentionType: 'mention',
      url: `https://twitter.com/${tweet.author.username}/status/${tweet.id}`,
      mentionedAt: new Date(tweet.created_at),
    })) ?? [];
  }

  async getFeed(keywords: string[], limit: number = 10): Promise<any> {
    // Fetch trending tweets with keywords
    const query = keywords.join(' OR ');
    const tweets = await this.client.v2.search(query, { max_results: limit });

    return {
      posts: tweets.data ?? [],
      trends: keywords, // Simplified, could integrate trending API
    };
  }

  async detectOpportunities(mentions: Mention[]): Promise<Opportunity[]> {
    // Simple heuristic: look for keywords indicating opportunity
    const opportunityKeywords = {
      partnership: ['partnership', 'collaborate', 'partner'],
      lead: ['hire', 'interested', 'contact'],
      question: ['how', 'what', 'can you', '?'],
      feedback: ['great', 'good', 'excellent', 'love'],
    };

    return mentions
      .map((mention) => {
        const text = mention.text.toLowerCase();
        const relevance = this.calculateRelevanceScore(text, opportunityKeywords);

        if (relevance.score > 0.3) {
          return {
            mentionId: mention.id,
            type: relevance.type,
            relevanceScore: relevance.score,
            context: mention.text,
          };
        }
      })
      .filter((o) => !!o);
  }

  async respond(mentionId: string, response: string): Promise<{ postId: string; url: string }> {
    // Reply to tweet
    const tweet = await this.client.v2.tweet(response, {
      reply: { in_reply_to_tweet_id: mentionId },
    });

    return {
      postId: tweet.data.id,
      url: `https://twitter.com/user/status/${tweet.data.id}`,
    };
  }

  async validateContent(content: string): Promise<{ valid: boolean; issues: string[] }> {
    const issues: string[] = [];

    if (content.length > 280) {
      issues.push('Tweet exceeds 280 character limit');
    }
    if (content.length === 0) {
      issues.push('Tweet cannot be empty');
    }
    // Add toxicity check here (third-party API)

    return {
      valid: issues.length === 0,
      issues,
    };
  }

  private calculateRelevanceScore(text: string, keywords: Record<string, string[]>): any {
    // Simple keyword matching
    let maxScore = 0;
    let bestType = 'feedback';

    for (const [type, words] of Object.entries(keywords)) {
      const matches = words.filter((w) => text.includes(w)).length;
      const score = matches / words.length;
      if (score > maxScore) {
        maxScore = score;
        bestType = type;
      }
    }

    return { score: maxScore, type: bestType };
  }
}
```

### 5.4 Social Media Manager Service

```typescript
// packages/mastra-engine/src/agent/social/manager.ts

export interface SocialMediaManager {
  // Publishing
  publishContent(request: PublishRequest): Promise<PublishResult>;
  schedulePost(request: PublishRequest): Promise<ScheduledPostId>;
  cancelScheduled(postId: string): Promise<void>;

  // Monitoring
  checkMentions(agentId: string): Promise<Mention[]>;
  detectOpportunities(agentId: string): Promise<Opportunity[]>;
  monitorFeed(agentId: string, keywords: string[]): Promise<FeedMonitorResult>;

  // Analytics
  getPostAnalytics(postId: string): Promise<PostMetrics>;
  getAgentAnalytics(agentId: string): Promise<AgentAnalytics>;

  // Response
  respondToMention(mentionId: string, response: string): Promise<PostResult>;

  // Config
  registerPlatform(config: SocialPlatformConfig): Promise<ConfigId>;
  deactivatePlatform(configId: string): Promise<void>;
}

export class SocialMediaManagerImpl implements SocialMediaManager {
  private db: Database;
  private platforms: Map<string, SocialPlatform> = new Map();
  private publishQueue: Queue;

  constructor(db: Database) {
    this.db = db;
    this.publishQueue = new Queue({ concurrency: 5 });
  }

  async publishContent(request: PublishRequest): Promise<PublishResult> {
    // Validate content
    const validation = await this.validateContent(request.content);
    if (!validation.valid) {
      return {
        success: false,
        error: validation.issues.join(', '),
      };
    }

    if (request.scheduledAt) {
      // Add to scheduler
      return this.schedulePost(request);
    } else {
      // Publish immediately
      return this.publishImmediately(request);
    }
  }

  private async publishImmediately(request: PublishRequest): Promise<PublishResult> {
    const results: Record<string, any> = {};

    for (const platformType of request.platforms) {
      const platform = this.platforms.get(platformType);
      if (!platform) {
        results[platformType] = { success: false, error: 'Platform not configured' };
        continue;
      }

      try {
        const result = await platform.publish({
          content: request.content,
          title: request.title,
          mediaUrls: request.mediaUrls,
          links: request.links,
          hashtags: request.hashtags,
        });

        // Store in DB
        const postId = await this.storePost(request.agentId, platformType, result);

        results[platformType] = {
          success: true,
          postId,
          url: result.url,
        };

        // Log
        await this.auditLog(request.agentId, 'publish', 'post', postId, platformType, 'success');
      } catch (error) {
        results[platformType] = {
          success: false,
          error: error.message,
        };

        await this.auditLog(request.agentId, 'publish', 'post', null, platformType, 'failed', error.message);
      }
    }

    return {
      success: Object.values(results).every((r) => r.success),
      results,
    };
  }

  async checkMentions(agentId: string): Promise<Mention[]> {
    // Get agent platforms
    const configs = await this.getPlatformConfigs(agentId);
    const allMentions: Mention[] = [];

    for (const config of configs) {
      const platform = this.platforms.get(config.platform_type);
      if (!platform) continue;

      try {
        const keywords = [config.account_handle];
        const mentions = await platform.searchMentions(keywords);
        allMentions.push(...mentions);

        // Store in DB
        for (const mention of mentions) {
          await this.storeMention(agentId, config.platform_type, mention);
        }
      } catch (error) {
        console.error(`Error checking mentions on ${config.platform_type}:`, error);
      }
    }

    return allMentions;
  }

  async detectOpportunities(agentId: string): Promise<Opportunity[]> {
    // Get recent mentions
    const mentions = await this.getRecentMentions(agentId);
    const allOpportunities: Opportunity[] = [];

    for (const mention of mentions) {
      const platform = this.platforms.get(mention.platform_type);
      if (!platform) continue;

      try {
        const opportunities = await platform.detectOpportunities([mention]);
        allOpportunities.push(...opportunities);

        // Store in DB
        for (const opp of opportunities) {
          await this.updateMentionAsOpportunity(opp);
        }
      } catch (error) {
        console.error(`Error detecting opportunities:`, error);
      }
    }

    return allOpportunities;
  }

  async monitorFeed(agentId: string, keywords: string[]): Promise<FeedMonitorResult> {
    const configs = await this.getPlatformConfigs(agentId);
    const results: any[] = [];

    for (const config of configs) {
      const platform = this.platforms.get(config.platform_type);
      if (!platform) continue;

      try {
        const feed = await platform.getFeed(keywords, 20);

        const monitorRecord = {
          agent_id: agentId,
          platform_type: config.platform_type,
          keywords: keywords.join(','),
          post_count: feed.posts.length,
          trend_data: JSON.stringify(feed.trends),
        };

        // Store in DB
        await this.storeFeedMonitoring(monitorRecord);

        results.push({
          platform: config.platform_type,
          postCount: feed.posts.length,
          trends: feed.trends,
        });
      } catch (error) {
        console.error(`Error monitoring feed on ${config.platform_type}:`, error);
      }
    }

    return {
      monitoredAt: new Date(),
      results,
    };
  }

  async respondToMention(mentionId: string, response: string): Promise<PostResult> {
    // Find mention
    const mention = await this.getMention(mentionId);
    if (!mention) {
      throw new Error('Mention not found');
    }

    // Validate response
    const validation = await this.validateContent(response);
    if (!validation.valid) {
      return {
        success: false,
        error: validation.issues.join(', '),
      };
    }

    // Get platform
    const platform = this.platforms.get(mention.platform_type);
    if (!platform) {
      throw new Error('Platform not configured');
    }

    try {
      const result = await platform.respond(mention.platform_post_id, response);

      // Store response post
      const postId = await this.storePost(mention.agent_id, mention.platform_type, result);

      // Link response to mention
      await this.linkMentionToResponse(mentionId, postId);

      await this.auditLog(mention.agent_id, 'respond', 'post', postId, mention.platform_type, 'success');

      return {
        success: true,
        postId,
        url: result.url,
      };
    } catch (error) {
      await this.auditLog(mention.agent_id, 'respond', 'post', null, mention.platform_type, 'failed', error.message);

      return {
        success: false,
        error: error.message,
      };
    }
  }

  async registerPlatform(config: SocialPlatformConfig): Promise<string> {
    // Store config
    const configId = await this.storePlatformConfig(config);

    // Initialize platform
    const provider = await this.getProviderCredentials(config.providerId);
    const platform = this.initializePlatform(config.platformType, provider);

    this.platforms.set(`${config.providerId}-${config.platformType}`, platform);

    return configId;
  }

  private async validateContent(content: string): Promise<{ valid: boolean; issues: string[] }> {
    const issues: string[] = [];

    if (!content || content.trim().length === 0) {
      issues.push('Content cannot be empty');
    }

    // Basic toxicity check (placeholder)
    const toxicWords = ['badword1', 'badword2']; // Simplified
    if (toxicWords.some((w) => content.toLowerCase().includes(w))) {
      issues.push('Content contains potentially offensive language');
    }

    // URL validation (placeholder)
    const urlPattern = /https?:\/\/\S+/g;
    const urls = content.match(urlPattern) || [];
    // Could validate URLs here

    return {
      valid: issues.length === 0,
      issues,
    };
  }

  // Helper methods would be implemented as needed
  private async storePost(agentId: string, platformType: string, result: any): Promise<string> {
    // Implementation
    return 'post-id';
  }

  private async storeMention(agentId: string, platformType: string, mention: Mention): Promise<void> {
    // Implementation
  }

  private async storePlatformConfig(config: SocialPlatformConfig): Promise<string> {
    // Implementation
    return 'config-id';
  }

  private async getPlatformConfigs(agentId: string): Promise<any[]> {
    // Implementation
    return [];
  }

  private async getRecentMentions(agentId: string): Promise<any[]> {
    // Implementation
    return [];
  }

  private async updateMentionAsOpportunity(opp: Opportunity): Promise<void> {
    // Implementation
  }

  private async storeFeedMonitoring(data: any): Promise<void> {
    // Implementation
  }

  private async getMention(mentionId: string): Promise<any> {
    // Implementation
    return null;
  }

  private async linkMentionToResponse(mentionId: string, postId: string): Promise<void> {
    // Implementation
  }

  private async auditLog(agentId: string, action: string, resourceType: string, resourceId: string | null, platformType: string, result: string, errorMessage?: string): Promise<void> {
    // Implementation
  }

  private async getProviderCredentials(providerId: string): Promise<any> {
    // Implementation
    return {};
  }

  private initializePlatform(platformType: string, credentials: any): SocialPlatform {
    // Implementation
    return new TwitterPlatform('token');
  }
}
```

### 5.5 Agent Tools

```typescript
// packages/mastra-engine/src/agent/tools/social.ts

export const socialMediaTools = {
  publishContent: createTool({
    id: 'publish_content',
    description: 'Publish content to social media platforms (Twitter, LinkedIn, Reddit, Discord)',
    inputSchema: z.object({
      platforms: z.array(z.enum(['twitter', 'linkedin', 'reddit', 'discord', 'slack'])),
      content: z.string().min(1).max(5000),
      title: z.string().optional(),
      mediaUrls: z.array(z.string().url()).optional(),
      links: z.array(z.string().url()).optional(),
      hashtags: z.array(z.string()).optional(),
      scheduledAt: z.date().optional(),
    }),
    execute: async (input) => {
      const socialManager = getSocialMediaManager();
      return socialManager.publishContent({
        agentId: context.agentId,
        ...input,
      });
    },
  }),

  checkMentions: createTool({
    id: 'check_mentions',
    description: 'Check for mentions of agent across social platforms',
    inputSchema: z.object({}),
    execute: async () => {
      const socialManager = getSocialMediaManager();
      return socialManager.checkMentions(context.agentId);
    },
  }),

  detectOpportunities: createTool({
    id: 'detect_opportunities',
    description: 'Detect partnership/collaboration opportunities in mentions',
    inputSchema: z.object({}),
    execute: async () => {
      const socialManager = getSocialMediaManager();
      return socialManager.detectOpportunities(context.agentId);
    },
  }),

  monitorFeed: createTool({
    id: 'monitor_feed',
    description: 'Monitor social feeds for trending topics and discussions',
    inputSchema: z.object({
      keywords: z.array(z.string()).min(1).max(10),
    }),
    execute: async (input) => {
      const socialManager = getSocialMediaManager();
      return socialManager.monitorFeed(context.agentId, input.keywords);
    },
  }),

  respondToMention: createTool({
    id: 'respond_to_mention',
    description: 'Respond to a mention on social media',
    inputSchema: z.object({
      mentionId: z.string(),
      response: z.string().min(1).max(5000),
    }),
    execute: async (input) => {
      const socialManager = getSocialMediaManager();
      return socialManager.respondToMention(input.mentionId, input.response);
    },
  }),

  getAnalytics: createTool({
    id: 'get_analytics',
    description: 'Get analytics for published posts',
    inputSchema: z.object({
      timeframe: z.enum(['today', 'week', 'month', 'all']).optional(),
    }),
    execute: async (input) => {
      const socialManager = getSocialMediaManager();
      return socialManager.getAgentAnalytics(context.agentId);
    },
  }),
};
```

---

## 6. Plano de Implementação

### Fase 1: Infrastructure & Twitter Integration (Sprint 1-2)
- [ ] Definir schema completo de banco de dados
- [ ] Criar migrations para tabelas sociais
- [ ] Implementar abstração `SocialPlatform` interface
- [ ] Implementar `TwitterPlatform` com publish + mention detection
- [ ] Setup integração com Twitter API v2
- [ ] Implementar `SocialMediaManager` core (publish immediate)
- [ ] Testes unitários para Twitter integration

### Fase 2: LinkedIn & Reddit Integration (Sprint 3)
- [ ] Implementar `LinkedInPlatform`
- [ ] Implementar `RedditPlatform`
- [ ] Integração com LinkedIn API
- [ ] Integração com Reddit API
- [ ] Opportunity detection heuristics
- [ ] Testes para multi-platform publishing
- [ ] Feed monitoring implementado

### Fase 3: Scheduling & Analytics (Sprint 4)
- [ ] Implementar scheduling queue
- [ ] Cron job para publicações agendadas
- [ ] Analytics aggregation
- [ ] Reputation scoring
- [ ] Dashboard de métricas
- [ ] Testes end-to-end

### Fase 4: Safety & Tools Integration (Sprint 5)
- [ ] Content moderation/validation
- [ ] Toxicity detection
- [ ] Rate limiting & quota enforcement
- [ ] Integração com agent tools
- [ ] Documentação completa
- [ ] Performance testing

---

## 7. Riscos e Mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|-------|---------------|--------|-----------|
| API rate limits exceed | Média | Alto | Implement queue + throttling + circuit breaker |
| Platform API changes | Média | Médio | Monitor API status, vendor SDKs, abstraction layer |
| Agente publica conteúdo inapropriado | Média | CRÍTICO | Content validation + human approval for critical topics |
| Autenticação expira (OAuth tokens) | Baixa | Alto | Implement token refresh, alert system |
| Performance degradation com muitos agentes | Baixa | Médio | Load testing, caching, database optimization |
| Privacy violations (PII em posts) | Baixa | CRÍTICO | Content scanning, GDPR compliance checks |
| Mention detection falha/miss rate | Média | Médio | Use multiple keyword strategies, human review |
| Platform SDK incompatibility | Baixa | Médio | Version pinning, early testing, fallback APIs |

---

## 8. Métricas de Sucesso

### Técnicas
- [ ] 3+ platforms integradas (Twitter, LinkedIn, Reddit)
- [ ] Publish latency < 2 segundos
- [ ] Mention detection accuracy > 95%
- [ ] Opportunity detection F1-score > 0.8 (v1 heuristic)
- [ ] Schedule job completion rate 99%+
- [ ] Content validation catches 100% of invalid content (length, structure)
- [ ] Support 100+ agentes publicando simultaneamente

### Funcionais
- [ ] Agentes podem publicar em múltiplas plataformas
- [ ] Agentes recebem notificação de menções
- [ ] Oportunidades são detectadas e apresentadas
- [ ] Posts agendados são publicados no tempo correto
- [ ] Analytics disponível por post e por agente
- [ ] Agentes podem responder automaticamente a menções

### de Negócio
- [ ] Aumentar visibility de agentes em 50%
- [ ] Gerar 10+ leads/oportunidades por semana (estimado)
- [ ] Reduzir time-to-market para novos provedores sociais
- [ ] Melhorar engagement de comunidade (medido por mention response rate)

---

## 9. Dependências Externas

### Plataformas & APIs
- **Twitter API v2** (com rate limits: 300 req/15min)
- **LinkedIn API** (com OAuth flow)
- **Reddit API** (com rate limits e authentication)
- **Discord API** (já integrado)
- **Slack API** (já integrado)

### Bibliotecas
- `twitter-api-v2` — Twitter client
- `linkedin-api-client` — LinkedIn client
- `snoowrap` ou `reddit-js` — Reddit client
- Existing: `discord.js`, `@slack/web-api`, Axios

### Serviços (opcional para v1)
- Content moderation API (Perspective API, Azure Content Moderator)
- Toxicity detection (ML model ou API)
- URL validation service

---

## 10. Estimativas

### Tamanho da Feature
**Esforço total:** ~120-150 horas (5 sprints)

### Breakdown por Fase
1. **Phase 1 (Twitter):** 35h (setup, Twitter integration, basic tools)
2. **Phase 2 (LinkedIn + Reddit):** 40h (adicionar 2 platforms, opportunity detection)
3. **Phase 3 (Scheduling + Analytics):** 30h (scheduler, metrics, reputation)
4. **Phase 4 (Safety + Integration):** 25h (validation, tools, docs, testing)

### Story Points (Fibonacci)
- Epic PRD-17: 55 story points (5 sprints, 1-2 devs)

---

## 11. Documentação Necessária

### Para Desenvolvedores
1. `docs/implementation/social-media-architecture.md` — Arquitetura geral
2. `docs/implementation/platform-integration-guide.md` — Como adicionar nova plataforma
3. `docs/implementation/social-media-api-reference.md` — API reference completa
4. `docs/implementation/opportunity-detection-heuristics.md` — Como funciona o scoring
5. `docs/implementation/social-media-schema.md` — Descrição do schema

### Para Operadores
1. `docs/operations/social-media-setup.md` — Como configurar credenciais
2. `docs/operations/rate-limiting.md` — Limites e quotas por plataforma
3. `docs/operations/monitoring-social.md` — Como monitorar saúde das integrações
4. `docs/operations/troubleshooting-social.md` — Debugging de problemas

### Para Usuários/Agentes
1. `docs/guides/agent-social-media.md` — Como usar social media tools
2. `docs/guides/content-best-practices.md` — Best practices para publicação

---

## 12. Critérios de Aceitação

- [ ] Schema de banco de dados criado e migrado
- [ ] TwitterPlatform implementado com publish + mention detection + feed search
- [ ] LinkedInPlatform implementado com publish + mention detection
- [ ] RedditPlatform implementado com publish + post criação
- [ ] SocialMediaManager implementado com publicação imediata
- [ ] Agent tools (publishContent, checkMentions, detectOpportunities, etc) integradas
- [ ] Scheduling de posts funcionando com cron
- [ ] Analytics (views, likes, engagement) coletados e disponíveis
- [ ] Oportunidades detectadas com heurística v1 (80%+ accuracy no teste manual)
- [ ] Content validation funcionando (comprimento, toxicity, links)
- [ ] Rate limiting respeitado para todas as plataformas
- [ ] Múltiplos agentes podem publicar simultaneamente sem conflito
- [ ] Audit log completo
- [ ] Documentação completa
- [ ] Testes end-to-end passando
- [ ] Performance benchmark < 2s publish latency

---

## 13. Próximos Passos Recomendados

### Imediato (Antes de iniciar Phase 1)
1. **Aprovação de arquitetura:** Apresentar PRD para código review
2. **Setup de credenciais:** Obter API keys para Twitter, LinkedIn, Reddit
3. **Definir política de conteúdo:** Quais tipos de conteúdo são permitidos?
4. **Consenso em heurística:** Como definir "opportunity"? Brainstorm com team

### Após Phase 1
1. **ML-based opportunity scoring:** Treinar modelo com dados coletados
2. **Sentiment analysis:** Implementar análise de sentimento em replies
3. **Automated responses:** Agentes responderem automaticamente a patterns
4. **Advanced scheduling:** A/B testing, recurring posts, optimal time detection

### Fase 2+ (Roadmap)
1. **Video platform support:** TikTok, YouTube, Instagram (requer human review)
2. **Social listening:** Monitorar competitors, industry trends
3. **Influencer collaboration:** Identificar e contactar influencers
4. **Analytics dashboard:** UI para visualizar engagement
5. **CRM integration:** Sync de leads para CRM system

---

**Preparado por:** Análise Detalhada (Agent)
**Data:** 2026-03-15
**Próxima revisão:** Após discussão arquitetônica (antes de Phase 1)

---

## Apêndice A: Exemplo de Workflow End-to-End

### Cenário: Agente publica novo criação e monitora engajamento

```typescript
// 1. Setup (operacional, primeira vez)
const socialManager = new SocialMediaManagerImpl(db);

// Registrar Twitter
await socialManager.registerPlatform({
  providerId: 'twitter-creds-1',
  platformType: 'twitter',
  accountHandle: '@my_agent_username',
});

// Registrar LinkedIn
await socialManager.registerPlatform({
  providerId: 'linkedin-creds-1',
  platformType: 'linkedin',
  accountHandle: 'my-agent-name',
});

// 2. Agent publica criação (via tool)
const publishResult = await agent.useTool('publish_content', {
  platforms: ['twitter', 'linkedin'],
  content: 'Excited to share my latest creation...',
  links: ['https://example.com/creation'],
  scheduledAt: new Date(Date.now() + 2 * 60 * 60 * 1000), // in 2 hours
});

// Result:
// {
//   success: true,
//   results: {
//     twitter: {
//       success: true,
//       postId: 'tweet-id-123',
//       url: 'https://twitter.com/.../status/tweet-id-123'
//     },
//     linkedin: {
//       success: true,
//       postId: 'li-post-456',
//       url: 'https://linkedin.com/feed/update/urn:li:activity:456'
//     }
//   }
// }

// 3. Agent monitora menções (scheduled task ou manual)
const mentions = await agent.useTool('check_mentions', {});
// Returns: [{ id, username, text, url, mentionedAt }, ...]

// 4. Agent detecta oportunidades
const opportunities = await agent.useTool('detect_opportunities', {});
// Returns:
// [
//   {
//     mentionId: 'mention-1',
//     type: 'partnership',
//     relevanceScore: 0.85,
//     context: 'Hey, we should collaborate on...'
//   }
// ]

// 5. Agent responde a oportunidade
const response = await agent.useTool('respond_to_mention', {
  mentionId: 'mention-1',
  response: 'Thanks for the interest! Let\'s discuss collaboration...',
});

// 6. Agent monitora feed de tópicos
const feedMonitor = await agent.useTool('monitor_feed', {
  keywords: ['agent automation', 'ai content creation'],
});

// 7. Agent obtém analytics (later, via separate tool ou dashboard)
const analytics = await agent.useTool('get_analytics', {
  timeframe: 'week',
});
// Returns:
// {
//   totalPosts: 5,
//   totalEngagement: 127,
//   avgLikesPerPost: 25.4,
//   avgCommentsPerPost: 3.2,
//   trends: { up: true, percentChange: 15 }
// }
```

---

**FIM DO DOCUMENTO**
