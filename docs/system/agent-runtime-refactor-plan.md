# Refatoração da Arquitetura de Agentes

## Status
Draft ativo

## Objetivo
Transformar o repositório em uma base para desenvolvimento de um sistema de agentes persistentes com integrações externas múltiplas, identidade própria, memória própria, comunicação interna entre agentes e criação dinâmica de novos agentes.

## Contexto
Hoje o pacote `packages/mastra-engine` já funciona para um caso concreto:
- um agente persistente criado por `createForgeAgent`
- memória própria com OM, working memory e long-term memory materializada
- providers autenticados por gateway custom (`openai-codex`, `claude-max`)
- uma integração externa concreta (`Discord`)

Isso valida partes importantes do sistema, mas a arquitetura ainda está centrada em um agente concreto e uma integração concreta.

## Leitura da Arquitetura Atual

### Núcleo atual
1. `createForgeAgent`
- cria storage, vector stores, workspace de memória, `Memory`, `ObservationalMemory`, `LongTermMemory`
- instancia `Agent`
- instancia `Mastra`
- injeta contexto fixo de memória por override de `generate/stream`

2. `createDiscordAgentClient`
- conecta no Discord
- normaliza a mensagem externa
- roda o loop de structured output
- entrega respostas ao canal

3. `ForgeAuthGateway`
- expõe providers autenticados por account/token
- adapta Codex e Claude Max ao runtime do Mastra

### Diagnóstico
1. O core do agente está acoplado ao caso `ForgeAgent`.
2. Identidade do agente ainda está implícita no `id` e em paths/DB names derivados dele.
3. Integração externa está modelada como cliente de Discord, não como adapter genérico.
4. O protocolo conversacional (`send_message` / `finish`) está preso à integração Discord.
5. Memória e runtime ainda estão misturados na mesma factory.
6. O gateway de auth está razoavelmente separado, mas ainda mistura credenciais, provider registry e adaptação de modelo.

## Direção Arquitetural
O repositório deve deixar de ser “um pacote de bot com memória” e passar a ser “um runtime de agentes persistentes com adapters externos”.

## Modelo Alvo

### 1. Domínio
Entidades centrais do sistema:
- `AgentProfile`
- `AgentAccount`
- `AgentRuntimeContext`
- `ExternalEvent`
- `AgentAction`

### 2. Runtime do agente
Responsável por:
- montar/configurar o `Agent` do Mastra
- garantir contexto fixo do agente
- aplicar memória, processors e workspace
- expor execução conversacional e execução de tarefas

### 3. Memória
Subsistema separado para:
- storage/vector
- OM
- working memory
- materialização de long-term memory
- recuperação híbrida por step

### 4. Integrações externas
Adapters por canal/serviço:
- Discord
- Email
- Webhooks
- futuros serviços

Cada adapter deve apenas:
- receber evento externo
- normalizar em um `ExternalEvent`
- encaminhar para o runtime/router
- entregar de volta as ações produzidas

### 5. Roteamento e orquestração
Camada responsável por:
- resolver qual agente atende qual account/evento
- mapear account externa -> agente
- suportar comunicação interna agente -> agente
- preparar criação dinâmica de agentes
- futuramente suportar filas/jobs/heartbeat

## Estrutura de Pastas Alvo

```text
packages/mastra-engine/src/
  domain/
    agent-profile.ts
    agent-account.ts
    external-event.ts
    agent-action.ts
    runtime-context.ts

  runtime/
    agent-runtime.ts
    conversation-loop.ts
    agent-router.ts
    agent-registry.ts
    account-registry.ts

  memory/
    memory-runtime.ts
    long-term-memory.ts
    observational-memory.ts
    recall-pipeline.ts

  integrations/
    discord/
      adapter.ts
      normalizer.ts
      delivery.ts

  providers/
    credentials/
      oauth-auth.ts
    adapters/
      openai-codex.ts
      claude-max.ts
    gateway/
      forge-auth-gateway.ts
      model-ids.ts

  presets/
    forge/
      create-forge-agent.ts
      system-prompt.ts
```

## Princípios da Refatoração
- `ForgeAgent` vira preset, não o centro da arquitetura.
- Discord vira adapter, não o centro da arquitetura.
- Providers/auth continuam em infraestrutura.
- Memória vira subsistema próprio.
- Roteamento, identidade e accounts viram domínio explícito.

## Fases da Refatoração

### Fase 0 — Documento canônico
- registrar arquitetura atual
- registrar arquitetura alvo
- marcar docs antigas como históricas quando necessário

### Fase 1 — Domínio mínimo
- introduzir tipos explícitos para agente, account, evento externo e ação
- sem mudar comportamento ainda

### Fase 2 — Extrair runtime
- separar runtime do agente do preset `createForgeAgent`
- separar memória/runtime/processors em módulos próprios

### Fase 3 — Generalizar protocolo de conversa
- tirar `send_message` / `finish` do Discord
- mover loop conversacional para `runtime/`

### Fase 4 — Transformar Discord em adapter
- separar normalização, entrega e sessão do Discord
- fazer Discord consumir o runtime genérico

### Fase 5 — Introduzir roteamento por account
- criar `AgentAccount`
- criar `AgentRouter`
- resolver agent por account externa

### Fase 6 — Registry/factory
- introduzir `AgentRegistry`, `AccountRegistry`, `AgentRuntimeFactory`
- preparar criação dinâmica de agentes

### Fase 7 — Comunicação agente-agente
- definir contrato de mensagens/eventos internos
- sem implementar fila ainda

### Fase 8 — Reorganizar providers/auth
- separar credenciais
- separar adapters de provider
- manter gateway como registry/resolução

## Prioridades Técnicas
1. Separar runtime e preset.
2. Separar protocolo conversacional e integração externa.
3. Criar modelo explícito de account e roteamento.
4. Extrair memória para módulo próprio.
5. Só depois introduzir comunicação agente-agente e filas.

## O que não implementar agora
- comunicação agente-agente completa
- criação dinâmica completa
- BullMQ/Trigger
- generalização total de todas as integrações externas

## Resultado esperado
Ao final da refatoração incremental, o repositório deve suportar:
- múltiplos agentes persistentes
- múltiplas accounts externas por agente
- adapters externos independentes
- runtime de agente reutilizável
- base preparada para criação dinâmica e comunicação interna
