# Gestão de Orçamento de Agentes

> **Baseado em:** Issue #190 + PR #217  
> **Última atualização:** 27/03/2026  
> **Autora:** Wiki Witch Writa

## Visão Geral

O sistema de gestão de orçamento permite ajustar o limite financeiro de contratos de agentes em execução. Este guia explica como funciona o ajuste top-down de orçamento.

## Conceitos Fundamentais

### Contrato de Execução

Cada agente hired possui um contrato de execução com:

- **budgetUsd**: Limite máximo de gastos em USD
- **startsAt / endsAt**: Período de vigência
- **executionState**: Estado atual (`idle` | `running`)

### Fluxo de Orçamento

```
┌─────────────────────────────────────────────────────────────────┐
│                    CICLO DE ORÇAMENTO                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   Empresa          Contrato             Empresa                 │
│   ├─ Cash     ───► │ Budget │ ───►     │ Cash                  │
│   $1000            $500             $500 (reservado)           │
│                                                                 │
│   Ao aumentar:                                                   │
│   Empresa ──$200──► Contrato (agora $700)                      │
│   $800             Reservado $700                               │
│                                                                 │
│   Ao executar ($50):                                             │
│   Contrato (gasta $50)                                          │
│   $500 → $450 disponível                                         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Ajuste Top-Down de Orçamento

### O que é?

O ajuste top-down permite que a empresa modifique o orçamento de um contrato de agente em execução, aumentando ou diminuindo o limite conforme necessidade.

### API Endpoint

```http
POST /admin/agent/contract/adjust-budget
```

### Parâmetros

| Campo          | Tipo     | Descrição                                |
| -------------- | -------- | ---------------------------------------- |
| `agentId`      | `string` | ID do agente cujo contrato será ajustado |
| `newBudgetUsd` | `number` | Novo limite de orçamento em USD          |

### Response

```typescript
interface AdjustBudgetResponse {
  agentId: string;
  contractId: string;
  previousBudgetUsd: number;
  newBudgetUsd: number;
  changeAmountUsd: number;
  changeType: 'increase' | 'decrease' | 'none';
}
```

## Regras de Validação

### Aumento de Orçamento

✅ **Permitido** quando:

- A empresa possui saldo suficiente (`companyCash >= valor do aumento`)

❌ **Bloqueado** quando:

- Saldo insuficiente na empresa
- Contrato não encontrado
- Novo orçamento < valor já gasto

### Redução de Orçamento

✅ **Permitido** quando:

- Novo orçamento >= valor já gasto
- Agente está em estado `idle` (não executando)

❌ **Bloqueado** quando:

- Novo orçamento < valor já gasto
- Agente está em estado `running`

### Exemplo de Validação

```typescript
// Cenário: tentar reduzir orçamento abaixo do gasto atual
const currentSpent = 300; // agente já gastou $300
const newBudget = 200; // tentativa de reduzir para $200

// ❌ BLOQUEADO: newBudget < currentSpent
// "Novo orçamento deve ser >= valor já gasto ($300)"
```

## Integração com Fluxo Financeiro

### Aumento: Reserva de Cash

```
┌──────────────────────────────────────────────┐
│  company_cash_ledger (antes)                 │
│  ┌────────────────────────────────────────┐  │
│  │ balance: $1000                         │  │
│  └────────────────────────────────────────┘  │
│                     │                         │
│              record_cash_out                  │
│        type: "agent-contract-budget-increase"│
│        amount: $200                           │
│                     │                         │
│  ┌────────────────────────────────────────┐  │
│  │ balance: $800                          │  │
│  └────────────────────────────────────────┘  │
│                                             │
│  company_cash_movements (novo registro)     │
│  ┌────────────────────────────────────────┐  │
│  │ type: agent-contract-budget-increase    │  │
│  │ amount: $200                            │  │
│  │ referenceType: agent-execution-contract│  │
│  │ referenceId: contract_xxx               │  │
│  └────────────────────────────────────────┘  │
└──────────────────────────────────────────────┘
```

## Componente UI: ContractBudgetAdjustCard

O `forge-admin` expõe a interface de ajuste através do `ContractBudgetAdjustCard`:

```typescript
// Localização: apps/forge-admin/src/features/agents/page.tsx

// Estados do componente:
interface ContractBudgetAdjustCard {
  // Estado: idle - Aguardando ação do usuário
  // Estado: loading - Processando ajuste
  // Estado: success - Ajuste realizado
  // Estado: error - Falha na validação
}
```

### Campos do Formulário

| Campo           | Validação               |
| --------------- | ----------------------- |
| `newBudget`     | > 0, numérico           |
| Botão "Ajustar" | Só habilitado se válido |

## Perguntas Frequentes

### Posso reduzir o orçamento de um agente em execução?

**Não diretamente.** Se o agente está `running`, a redução é bloqueada. Aguarde até que o agente termine a execução (`idle`) ou use o valor não-utilizado ao término do contrato.

### O que acontece com o saldo excedente ao reduzir?

O valor não-utilizado permanece disponível no contrato até o fim do período. Ao término do contrato, o saldo residual retorna para o `companyCash` da empresa.

### Como saber quanto um agente já gastou?

Consulte o `executionState` do contrato. O campo `budgetUsd` mostra o limite e a diferença com os gastos é calculada internamente pelo sistema de execução.

---

**Tags:** `budget` `finance` `contracts` `agents`
