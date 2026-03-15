# PRD-08: Controle de Fluxo de Caixa (Budget Global de LLM)

**Status:** Planejamento
**Data:** 2026-03-15
**Versão:** 1.0

---

## Objetivo

Implementar um sistema de budget global para controlar o ritmo de execução de LLM na plataforma. A plataforma deve respeitar um limite mensal de tokens/custos e throttle (desacelerar) execuções de agentes quando aproximando-se do limite.

---

## Conceito

**Budget Global = Limite mensal de custos de LLM para toda a plataforma**

Não é limite por agente, mas sim limite agregado que controla:
- Quantos tokens LLM a plataforma pode gastar por mês
- Quando throttle/desacelerar execuções (reduzir concorrência, aumentar retry delays)
- Quando parar completamente (se atingir hard limit)

---

## Requisitos Funcionais

**FR1: Rastrear Gastos Totais**
- Monitorar consumo total de tokens de todos os agentes
- Atualizar contador em tempo real
- Registrar custo por provedor (OpenAI, Claude, etc)

**FR2: Definir Budget Mensal**
- Configurar limite mensal global (ex: $100 USD/mês)
- Reset automático a cada novo mês
- Threshold para alertas (ex: 80% → aviso)

**FR3: Throttle Automático**
- Se 70% do budget: reduzir concorrência, aumentar delays entre execuções
- Se 85% do budget: modo lento, priorizar apenas tarefas críticas
- Se 95% do budget: apenas leitura, sem novos processamentos
- Se 100%: parar completamente

**FR4: Visibilidade**
- Ferramenta para consultar: gastos totais, % usado, remaining
- Logs de quando throttle foi ativado
- Histórico de gastos por dia/semana/mês

---

## Schema do Banco de Dados

**Tabela: budget_config**
```typescript
{
  id: 'global',
  monthly_budget_usd: number,
  reset_day: number, // dia do mês (1-31)
  alert_threshold_percent: number, // ex: 80
  throttle_threshold_percent: number, // ex: 70
  updated_at: timestamp
}
```

**Tabela: budget_usage**
```typescript
{
  id: UUID,
  date: date,
  provider: string, // 'openai', 'anthropic', etc
  tokens_used: number,
  cost_usd: number,
  agent_id: string,
  timestamp: timestamp
}
```

**Cache/Estado Runtime:**
```typescript
{
  current_month_cost_usd: number,
  last_updated: timestamp,
  throttle_status: 'normal' | 'slow' | 'critical' | 'paused'
}
```

---

## Decisões Técnicas

1. **Custos calculados em tempo real** — Cada chamada LLM registra uso imediato
2. **Reset automático** — Primeiro dia do mês ou data configurada
3. **Throttle gracioso** — Não falha abruptamente, degrada performance
4. **Sem billing externo** — Apenas controle interno, não integra com Stripe/Asaas

---

## Exemplo de Fluxo

```
Agente A tenta executar LLM
  ↓
Sistema checa budget atual
  ↓
Se 70%: reduzir concorrência (queue delay +500ms)
Se 85%: modo crítico only (rejeita tasks não essenciais)
Se 95%: pausa (rejeita todas as execuções)
  ↓
Registra gastos em budget_usage
  ↓
Atualiza counter total
```

---

**Versão:** 0.1
**Última Atualização:** 2026-03-15
