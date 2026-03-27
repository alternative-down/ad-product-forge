# ad-product-forge — Análise Comercial

> ⚠️ **AVISO IMPORTANTE:** Este documento é uma **PROPOSTA ESTRATÉGICA** de valor para transformação do ad-product-forge em um produto vendável. **NÃO é uma lista de tarefas de implementação.** As oportunidades aqui descritas são hipóteses para discussão estratégica — a decisão de implementação cabe à equipe.

> **Público:** Nicolas  
> **Data:** 27 de março de 2026  
> **Objetivo:** Levantamento de insights comerciais, oportunidades de mercado e propostas de valor

---

## 1. Posicionamento de Mercado

### O que é o ad-product-forge?

Plataforma de **orquestração de agentes AI multi-agente** com foco em automação de workflows via **self-hosted** e integração direta com **Coolify**. Permite que empresas montem equipes de agentes especializados que colaboram, se auto-organizam e executam tarefas complexas de forma autônoma.

### Diferencial Principal

| Competidor | Foco | ad-product-forge |
|------------|------|------------------|
| LangChain/LangGraph | Framework para devs | Plataforma low-code para equipes |
| CrewAI | Orquestração básica | Integração Coolify, self-hosted |
| Kore.ai / Kore.AI | Enterprise fechado | Open, self-hosted, customizável |
| Make.com / Zapier | Automação simples | Agentes autônomos com memória |

**Diferencial的核心:** Self-hosted + Coolify = controle total + deploy simplificado

---

## 2. Modelos de Preçamento Identificados

### 2.1 Usage-Based (Baseado em Uso)
- **Tokens consumidos** por agentes
- Custo proporcional ao uso real
- Ideal paraProof of Concept (POC)

### 2.2 Subscription Tiers
| Tier | Preço Estimado | Features |
|------|----------------|----------|
| Free | $0 | 3 agentes, 10 runs/dia |
| Pro | $29-79/mês | Agentes ilimitados, runs ilimitadas |
| Enterprise | $199-499/mês | Multi-instance, SSO, priority support |

### 2.3 Per-Agent Pricing
- Cada agente tem custo individual
- Modelo "pay per agent"
- Flexível para casos de uso específicos

### 2.4 Outcome-Based (Baseado em Resultado)
- Pagamento por tarefa concluída
- Ideal para automação de processos específicos
- Maior valor percebido pelo cliente

---

## 3. Oportunidades Identificadas

### 3.1 Agent Marketplace ⭐ (ALTA PRIORIDADE)

**Proposta:** Loja de agentes pré-configurados para casos de uso comuns

**Modelos de Receita:**
- Marketplace fee (10-15% por transação)
- Agent subscription (vendas recorrentes)
- Featured placement (receita publicitária)

**Casos de Uso para Agentes:**
- Agente de Desenvolvimento (code review, refactoring)
- Agente de Documentação (geração de docs, wikis)
- Agente de QA (testes automatizados)
- Agente de Suporte (tickets, FAQ)
- Agente de Marketing (copy, social media)
- Agente de Análise de Dados (relatórios, dashboards)

**Mercado Alvo:**
- Desenvolvedores individuais: $5-15/agente
- Small teams (5-20 pessoas): $29-79/mês
- Agências digitais: $99-199/mês

**Timing:** Mercado de agent marketplaces ainda está emergindo (2025-2026)

---

### 3.2 Cross-Instance Messaging (#237) ⭐

**Issue:** [#237](https://github.com/alternative-down/ad-product-forge/issues/237)

**Proposta:** Permite comunicação entre instâncias do ad-product-forge

**Casos de Uso:**
- Multi-tenant SaaS
- Empresas com múltiplos departamentos
- Consórcios de empresas parceiras

**Modelos de Receita:**
- Multi-instance license
- Enterprise tier específico

---

### 3.3 Task Scheduling Entre Agentes (#225) ⭐

**Issue:** [#225](https://github.com/alternative-down/ad-product-forge/issues/225)

**Proposta:** Um agente pode criar tasks/schedules para outros agentes

**Valor Diferencial:**
- Agentes podem se delegar tarefas
- Workflows mais autônomos
- Redução de intervenção humana

**Mercado:**
- Automação de processos de TI
- DevOps automation
- Business process automation

---

### 3.4 Agent Memory & Contexto Persistente

**Feature Request:** Memória de longo prazo compartilhada entre agentes

**Valor:**
- Agentes "lembram" interações passadas
- Contexto mantido entre sessões
- Aprendizagem contínua

---

## 4. Segmentos-Alvo Prioritários

### 4.1 Agências Digitais Brasileiras
- **Tamanho:** 2-20 funcionários
- **Problema:** Necessidade de automatizar tarefas repetitivas (criar conteúdo, responder clientes)
- **Willingness to Pay:** $29-99/mês
- **Prazo:** Curto-médio prazo (3-6 meses)

### 4.2 Equipes de Desenvolvimento
- **Tamanho:** 5-50 devs
- **Problema:** Code review, documentação, automação de CI/CD
- **Willingness to Pay:** $99-299/mês
- **Prazo:** Médio prazo (6-12 meses)

### 4.3 Startups de Tecnologia
- **Tamanho:** 3-15 funcionários
- **Problema:** Automação de processos sem equipe dedicada
- **Willingness to Pay:** $49-149/mês
- **Prazo:** Curto prazo (1-3 meses)

### 4.4 Enterprise (Longo Prazo)
- **Tamanho:** 50+ funcionários
- **Problema:** Orquestração de múltiplos agentes em escala
- **Willingness to Pay:** $499-1999/mês
- **Prazo:** Longo prazo (12-24 meses)

---

## 5. Proposta de Valor

### Tagline Sugerida
> **"Equipes de agentes AI que trabalham 24/7 para sua empresa"**

### Mensagens-Chave

1. **Zero Infrastructure Headache**
   - Deploy em minutos com Coolify
   - Sem configuração complexa

2. **Agentes que Colaboram**
   - Multi-agente orchestration
   - Memória compartilhada
   - Self-organizing teams

3. **Controle Total**
   - Self-hosted
   - Seus dados, sua infraestrutura
   - Compliant (LGPD, GDPR)

4. **ROI Imediato**
   - Redução de tarefas manuais
   - Disponibilidade 24/7
   - Escala sem contratar

---

## 6. Gaps de Produto Identificados

| Gap | Prioridade | Esforço | Notas |
|-----|------------|---------|-------|
| Agent Marketplace | Alta | Alto | Receita recorrente |
| Dashboard de Analytics | Média | Médio | Métricas de uso |
| Agent Templates Library | Alta | Baixo | Onboarding |
| Integrações (Slack, Discord) | Média | Médio | Adoção |
| Billing/Usage Tracking | Alta | Médio | Suporte a pricing |
| SSO/SAML | Baixa | Alto | Enterprise |

---

## 7. Roadmap de Go-to-Market

### Fase 1: MVP (Mês 1-2)
- [ ] Agente Marketplace básico
- [ ] Dashboard de uso
- [ ] Pricing tiers (Free/Pro)

### Fase 2: Crescimento (Mês 3-4)
- [ ] Cross-instance messaging
- [ ] Agent templates library
- [ ] Integrações (Slack)

### Fase 3: Scale (Mês 5-6)
- [ ] Enterprise features (SSO)
- [ ] Advanced analytics
- [ ] Outcome-based pricing option

---

## 8. Análise Competitiva Detalhada

### Preços Competidores

| Plataforma | Free Tier | Pro Tier | Enterprise |
|------------|-----------|----------|------------|
| CrewAI | Limitado | ~$25/mês | sob consulta |
| LangChain | Framework | Enterprise | sob consulta |
| Kore.ai | Limitado | ~$400/mês | sob consulta |
| **ad-product-forge** | **Full features** | **$29-79** | **$199-499** |

### Vantagens Competitivas
1. **Self-hosted first** — diferenciador único
2. **Coolify integration** — deploy em minutos
3. **Brazilian market** — foco local (LGPD compliance)
4. **Open architecture** — extensível

---

## 9. Recomendações

### GO ✅
1. **Agent Marketplace** — maior oportunidade de receita recorrente
2. **Cross-instance messaging (#237)** — habilita用例 enterprise
3. **Task scheduling (#225)** — autonomia dos agentes

### HOLD ⏸️
1. **Enterprise SSO** — depende de cliente enterprise
2. **Outcome-based pricing** — complexo de implementar

### PRIORIDADE IMEDIATA
1. Implementar pricing tiers (Free/Pro/Enterprise)
2. Desenvolver Agent Marketplace MVP
3. Finalizar #237 (cross-instance) e #225 (scheduling)

---

## 10. Próximos Passos

1. **Validar pricing tiers** com clientes potenciais
2. **Prototipar Agent Marketplace** com 3-5 agentes
3. **Gather feedback** de beta users
4. **Ajustar positioning** baseado em feedback

---

*Documento preparado por Marina — Opportunity Explorer*  
*Alternative Down — 27 de março de 2026*
