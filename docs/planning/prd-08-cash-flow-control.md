# PRD-08: Controle de Fluxo de Caixa (Simplificado)

**Status:** Rascunho - Simplificado para Desenvolvedor Solo
**Data:** 2026-03-15
**Nota:** Projeto de desenvolvedor pessoal. Aplicar princípios KISS + YAGNI.

---

## 1. Sumário

### Classificação: APLICAÇÃO AD-PRODUCT-FORGE (OPCIONAL)

**Este PRD descreve recursos de controle de custo específicos para ad-product-forge.** Limites de orçamento e controles de gastos permitem que Nicolas gerencie custos de agentes conforme a plataforma escala. Atualmente opcional, adiado até que múltiplos agentes exijam gerenciamento de orçamento.

### Objetivo
**OPCIONAL** - Definir limites de gastos mensais por agente.

### Por que Desproiorizado
- Dev solo pode rastrear manualmente orçamento
- Não é necessário para MVP (apenas 1-2 agentes inicialmente)
- Pode adicionar se/quando escalar para múltiplos agentes
- Proporção valor-para-esforço muito baixa atualmente

---

## 2. Escopo

### Incluído
- Definir limite de gastos por agente (mensal)
- Verificar orçamento restante antes da ação
- Alertar quando limite se aproxima
- Logging simples

### Não Incluído
- Protocolos de emergência
- Escalação de restrição
- Equidade entre agentes
- Realocação dinâmica
- Previsão
- Integração com dados financeiros externos
- Fluxos de trabalho de aprovação
- Dashboard de UI

---

## 3. Requisitos Mínimos (se implementado)

### RF-1: Ferramenta setSpendingLimit
```typescript
interface SetSpendingLimitParams {
  agentId: string;
  monthlyLimit: number; // USD
}

// Retorna: success: boolean
```

### RF-2: Ferramenta getSpendingStatus
```typescript
interface GetSpendingStatusParams {
  agentId: string;
}

// Retorna: {
//   limit: number;
//   spent: number;
//   remaining: number;
// }
```

---

## 4. Banco de Dados (Mínimo)

```sql
CREATE TABLE agent_spending_limits (
  agent_id TEXT PRIMARY KEY,
  monthly_limit DECIMAL(10, 2)
);
```

Nota: Usar financial_log existente de PRD-19 para calcular gastos do mês atual.

---

## 5. Implementação (se necessário)

- Criar tabela única: agent_spending_limits
- Implementar setSpendingLimit, getSpendingStatus (2-3h total)
- Usar financial_log de PRD-19 para cálculo

---

## 6. Critérios de Sucesso
- [ ] Pode definir limite de gastos por agente
- [ ] Pode visualizar gastos do mês atual
- [ ] Pode ver orçamento restante

---

## 7. Status
**Adiado** - Nice to have, não essencial para MVP.

---

## 8. Esforço
- **Total: 2-3 horas** (se implementado)

---

**Fim do documento**
