# PRD-06: Integração de Pagamento & Faturamento

**Status:** Rascunho - Simplificado para Desenvolvedor Solo
**Data:** 2026-03-15
**Versão:** 1.0
**Nota:** Projeto pessoal por desenvolvedor solo. Escopo limitado a funcionalidade principal (KISS + YAGNI).

---

## Sumário Executivo

### Classificação: APLICAÇÃO AD-PRODUCT-FORGE

**Este PRD descreve infraestrutura de processamento de pagamento específica para ad-product-forge.** Integração de faturamento permite que produtos SaaS de Nicolas aceitem pagamentos de clientes e gerenciem ciclos de vida de inscrições. Esta é infraestrutura comercial específica da aplicação, não do framework.

### Objetivo
Implementar processamento básico de pagamento para inscrições usando Stripe, permitindo que a plataforma aceite pagamentos e gerencie ciclos de vida de inscrições.

### Recursos Principais (para ad-product-forge)
1. **Integração Stripe** - Processar pagamentos para produtos SaaS de Nicolas
2. **Gerenciamento de Inscrições** - Criar, atualizar, cancelar inscrições de clientes
3. **Histórico de Transações Básico** - Registrar pagamentos bem-sucedidos para rastreamento financeiro

### Fora do Escopo
- Múltiplos provedores de pagamento
- Reconciliação ERP
- Dashboard de admin
- Reembolsos & tratamento de disputas
- Recuperação avançada de erros
- Processamento de eventos webhook
- Detalhes de conformidade PCI (Stripe lida com isso)

---

## Modelo de Dados

### Inscrições
```typescript
subscriptions {
  id: UUID
  customer_id: UUID (foreign key)
  stripe_subscription_id: string (referência Stripe)
  product_id: string
  status: 'active' | 'cancelled'
  amount: decimal
  billing_cycle: 'monthly' | 'annual'
  start_date: timestamp
  created_at: timestamp
  updated_at: timestamp
}
```

### Transações
```typescript
transactions {
  id: UUID
  subscription_id: UUID (foreign key, opcional)
  customer_id: UUID (foreign key)
  stripe_payment_id: string (referência Stripe)
  amount: decimal
  status: 'completed' | 'failed'
  created_at: timestamp
}
```

---

## Endpoints da API

### Inscrições
- `POST /api/billing/subscriptions` — Criar inscrição
- `GET /api/billing/subscriptions/:id` — Obter inscrição
- `PUT /api/billing/subscriptions/:id` — Atualizar inscrição (cancelar)
- `GET /api/billing/subscriptions` — Listar inscrições do cliente

### Transações
- `GET /api/billing/transactions` — Listar transações
- `GET /api/billing/transactions/:id` — Obter detalhes de transação

---

## Notas de Implementação

### Banco de Dados
- Usar Drizzle ORM + LibSQL existente
- Criar tabelas: `subscriptions`, `transactions`
- Indexar campo stripe_subscription_id

### Integração Stripe
- Usar SDK Stripe (pacote npm `stripe`)
- Armazenar chaves Stripe em variáveis de ambiente
- Criar/cancelar inscrições via API Stripe
- Armazenar estado de inscrição localmente para referência

### Tratamento de Erros
- Registrar pagamentos falhados
- Retornar erros de validação significativos
- Nenhuma lógica de retry necessária (Stripe lida com isso)

### Validação
- Usar Zod para validação de requisição
- Obrigatório: customer_id, product_id, amount, billing_cycle

---

## Critérios de Sucesso
- Inscrições podem ser criadas e canceladas em Stripe
- Histórico de transações consultável
- Tratamento básico de erros para falhas Stripe
- Dados persistem corretamente

---

## Considerações de Segurança
- Verificar assinaturas de webhook Stripe (não negociável)
- Nunca registrar informação completa de cartão de crédito (Stripe lida com isso)
- Usar HTTPS para todas as chamadas de API
- Armazenar chaves Stripe apenas em variáveis de ambiente

---

## Dependências
- SDK Stripe
- Drizzle ORM (existente)
- LibSQL (existente)
- Zod (existente)

---

## Timeline
- **Semana 1:** Schema de banco de dados + setup de SDK Stripe
- **Semana 2:** Endpoints CRUD de inscrição
- **Semana 3:** Logging de transações + testes
- **Semana 4:** Documentação

Total: ~25 horas para desenvolvedor solo

---

**Histórico do Documento:**
- v1.0 (2026-03-15): Simplificado para projeto pessoal de desenvolvedor solo
