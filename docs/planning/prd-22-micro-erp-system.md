# PRD-22: Sistema Micro-ERP (Simplificado)

**Status:** Rascunho - Simplificado para Desenvolvedor Solo
**Data:** 2026-03-15
**Nota:** Projeto de desenvolvedor pessoal. Aplicar princípios KISS + YAGNI.

---

## 1. Resumo

### Classificação: APLICAÇÃO AD-PRODUCT-FORGE

**Este PRD descreve infraestrutura de operações comerciais específica do ad-product-forge.** Rastreamento financeiro permite que Nicolas entenda a economia da sua plataforma de agente autônomo (custos vs. receita). Isto é específico da aplicação, não infraestrutura de framework.

### Objetivo
Rastrear métricas financeiras simples (despesas, receitas).

### Valor (para ad-product-forge)
- Entender custos de executar agentes e serviços
- Rastrear receita gerada por aplicações
- Previsão simples para planejamento de negócio

### Nota Importante
Este é um projeto pessoal. Pular recursos complexos como:
- Fluxos de trabalho de aprovação
- Limites de orçamento
- Relatório de conformidade
- Integração com software de contabilidade externa

---

## 2. Escopo

### Incluído
- Registrar despesas (categoria de custo, valor, descrição)
- Registrar receitas (fonte, valor, descrição)
- Calcular custos de agente (simples)
- Relatório básico

### Não Incluído
- Fluxos de trabalho de aprovação
- Aplicação de orçamento
- Algoritmos de previsão
- Análise de cenário
- Dashboard UI
- Integração com QuickBooks/Xero
- Gerenciamento de folha de pagamento
- Suporte a múltiplas moedas
- Relatório de imposto/conformidade

---

## 3. Requisitos

### RF-1: Ferramenta logExpense
```typescript
interface LogExpenseParams {
  amount: number;
  description: string;
}

// Retorna: success: boolean
```

### RF-2: Ferramenta logRevenue
```typescript
interface LogRevenueParams {
  amount: number;
  description: string;
}

// Retorna: success: boolean
```

### RF-3: Ferramenta getSummary
```typescript
interface GetSummaryParams {
  // Sem params - retornar resumo do mês atual
}

// Retorna: {
//   totalExpenses: number;
//   totalRevenues: number;
//   netProfit: number;
// }
```

---

## 4. Banco de Dados

```sql
CREATE TABLE financial_log (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL, -- 'expense' ou 'revenue'
  amount DECIMAL(10, 2) NOT NULL,
  description TEXT,
  logged_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## 5. Critérios de Sucesso
- [ ] Consegue registrar despesas e receitas
- [ ] Consegue visualizar resumo mensal
- [ ] Retorna totais corretos

---

## 8. Status
**Adiado** - Bom ter, não essencial para MVP.

---

## 7. Esforço
- **Total: ~4 horas**

---

**Fim do documento**
