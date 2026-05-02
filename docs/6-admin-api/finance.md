# Rotas de Finance

## Visão Geral Financeira

```bash
GET /admin/finance/overview
```

**Resposta:**
```json
{
  "balance": 5000.00,
  "totalPayables": 2000.00,
  "recentMovements": [
    {
      "id": "uuid",
      "type": "credit",
      "amount": 500.00,
      "description": "Top-up",
      "createdAt": 1704067200000
    }
  ],
  "recurringPayables": [
    {
      "id": "uuid",
      "description": "AWS",
      "amount": 200.00,
      "frequency": "monthly",
      "nextDueDate": 1706755200000,
      "isActive": true
    }
  ]
}
```

## Criar Ledger Entry

```bash
POST /admin/finance/ledger-entry
```

**Body:**
```json
{
  "type": "credit",
  "amount": 500.00,
  "description": "Top-up para agente Orion"
}
```

## Criar Contrato

```bash
POST /admin/finance/contract
```

**Body:**
```json
{
  "agentId": "agent-uuid",
  "budgetUsd": 1000.00,
  "startsAt": 1704067200000,
  "endsAt": 1706755200000
}
```

## Criar Recurring Payable

```bash
POST /admin/finance/recurring-payable
```

**Body:**
```json
{
  "description": "AWS",
  "amount": 200.00,
  "frequency": "monthly"
}
```

## Atualizar Recurring Payable

```bash
PUT /admin/finance/recurring-payable/:id
```

**Body:**
```json
{
  "amount": 250.00,
  "isActive": true
}
```

## Toggle Recurring Payable

```bash
POST /admin/finance/recurring-payable/:id/toggle
```

Alterna entre ativo/inativo.
