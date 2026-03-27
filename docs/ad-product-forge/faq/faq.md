# FAQ - Perguntas Frequentes

> **Baseado em:** Issue #244 (Tracking docs)  
> **Última atualização:** 27/03/2026  
> **Autora:** Wiki Witch Writa

## Contratos de Agentes

### O que é um contrato de execução?

É um acordo formal entre a empresa e um agente interno que define:
- O limite de orçamento (`budgetUsd`)
- O período de vigência (`startsAt` a `endsAt`)
- As capacidades e permissões do agente

### Posso ter múltiplos contratos simultâneos para o mesmo agente?

Sim, o sistema permite contratos sobrepostos, mas apenas **um contrato ativo por vez**. O sistema identifica o contrato ativo baseado no timestamp atual.

### O que acontece quando o contrato expira?

1. O agente para de executar automaticamente
2. O saldo residual retorna para o `companyCash` da empresa
3. Um novo contrato pode ser criado para reativar o agente

### Como funciona a renovação automática?

O sistema usa `renewContract()` com ciclo semanal:
```typescript
const WEEK_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias
```

A renovação:
1. Verifica se `endsAt - now < renewalThreshold`
2. Se sim, estende `endsAt += WEEK_MS`
3. Mantém o mesmo `budgetUsd` ou ajusta conforme configurado

## Gestão de Orçamento

### Qual a diferença entre budget e cash?

| Conceito | Descrição |
|----------|-----------|
| **Cash** | Saldo disponível na empresa (`companyCash`) |
| **Budget** | Limite alocado para um contrato específico |

### Posso reduzir o orçamento de um agente em execução?

**Depende do estado:**
- `idle`: ✅ Sim, se novo budget >= valor já gasto
- `running`: ❌ Não, aguarde o término da execução

### O que acontece com o saldo não-utilizado?

Retorna para `companyCash` ao término do contrato ou em caso de encerramento antecipado.

### Como o sistema impede gastos excessivos?

1. **Validação de cash:** Ao aumentar budget, verifica-se se há saldo suficiente
2. **Validação de decrease:** Ao reduzir, impede-se se novo budget < gasto atual
3. **Execução atômica:** Transações são tratadas como atomicidade no ledger

## Sistema de Permissões

### O que é um Role?

É um conjunto de permissões (capabilities) que define o que um agente pode fazer. Roles comuns: `ADMIN`, `FINANCE`, `DEVELOPER`, `AGENT`.

### Como adicionar uma nova tool ao sistema?

1. Definir o `toolId` em `forgeCustomToolIds` em `catalog.ts`
2. Implementar a lógica da tool em `src/tools/`
3. Registrar as permissões por role em `src/capabilities/`
4. Atualizar a documentação

### Posso criar roles customizados?

Sim, via:
```typescript
manage_agent_role('create', { name: 'CUSTOM_ROLE', capabilities: [...] })
```

## Fluxo de Contratação

### Quais os passos para contratar um agente?

1. **Definir função:** Criar ou selecionar uma função existente
2. **Configurar capacidades:** Associar roles e tools
3. **Estabelecer contrato:** Definir budget e período
4. **Ativar:** Iniciar o agente

### O que é o workflow `hire-internal-agent`?

É um workflow completo que executa:
1. Validação de permissões
2. Criação da função do agente
3. Configuração de capacidades
4. Criação do contrato inicial

### Posso mudar a função de um agente em tempo real?

Sim, via `change_agent_function` ou `change_own_function`.

## Integração GitHub/Coolify

### Como o agente acessa repositórios?

Via `get_github_git_credentials()` que retorna:
```typescript
{
  token: 'ghs_xxx',
  repoUrl: 'https://github.com/org/repo.git',
  gitUser: 'agent-slug'
}
```

### O agente pode fazer deploys via Coolify?

Sim, com as tools:
- `list_coolify_applications()`
- `manage_coolify_application()`
- `toggle_coolify_application()`
- `get_coolify_deployment_logs()`

### Quais permissões são necessárias para deploy?

Role `DEVELOPER` com capabilities de Coolify.

## Troubleshooting

### Erro: "No active contract for agent"

**Causa:** O agente não possui contrato no período atual.

**Solução:**
1. Verificar se existe contrato criado
2. Verificar se `startsAt <= now <= endsAt`
3. Criar novo contrato se necessário

### Erro: "Insufficient company cash for budget increase"

**Causa:** Saldo insuficiente para aumentar budget.

**Solução:**
1. Verificar saldo: `list_company_cash()`
2. Adicionar fundos à empresa
3. Reduzir valor do aumento desejado

### Erro: "New budget must be >= spent amount"

**Causa:** Tentativa de reduzir abaixo do valor já gasto.

**Solução:**
1. Aguardar execução finalizar
2. Ou aumentar o novo budget para >= valor gasto

### Erro: "Permission denied for tool"

**Causa:** Role do agente não inclui capability da tool.

**Solução:**
1. Verificar role atual: `list_agent_roles()`
2. Verificar capabilities da tool: `list_available_capabilities()`
3. Atribuir role adequado ou adicionar capability

---

**Tags:** `faq` `troubleshooting` `contracts` `permissions`
