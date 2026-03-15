# Sistema Autônomo — Visão Geral

## Objetivo
Criar uma empresa digital operada por agentes LLM autônomos que funcionam sem intervenção humana, de forma coordenada e contínua.

## Princípios Operacionais

**Autonomia completa**: Todas as etapas executam automaticamente, sem aprovações manuais.

**Rastreabilidade**: Cada decisão deixa registro de contexto e evidência.

**Revisão contínua**: Decisões podem ser reavaliadas quando novos sinais chegam.

**Estados explícitos**: Itens percorrem status claros e previsíveis (ativo, priorizado, adiado, descartado).

**Aprendizado cíclico**: Dados da operação de produtos alimentam novas decisões.

**Controle financeiro básico**: Visibilidade simples de contas a pagar, a receber, custos e fluxo de caixa.

## Arquitetura de Agentes

Cada agente é um "funcionário" da empresa com:

- **Identidade**: Nome, email, persona, papel (define ferramentas iniciais)
- **Thread única**: Histórico persistente de tudo que o agente processa
- **Memória isolada**: Conhecimento próprio, separado de outros agentes
- **Fila de jobs**: Eventos chegam como jobs que disparam execuções

## Ciclo de Execução (Run Loop)

1. **Trigger**: Um job chega na fila do agente
2. **Setup**: Runtime clona a thread principal para criar contexto isolado
3. **Execução por steps**:
   - Antes de cada step, memória relevante é recuperada (busca híbrida: vetorial + BM25)
   - Resultados são injetados como contexto no passo atual
   - Agente não chama memória manualmente; é injeção automática
4. **Fechamento**:
   - Novas informações são armazenadas na memória de longo prazo
   - Um resumo executivo compacto é gerado
   - Apenas o prompt inicial e resumo voltam à thread principal
   - Histórico detalhado é descartado para evitar inchaço de contexto

## Comunicação Entre Agentes

Assíncrona baseada em eventos:

- Agentes enviam mensagens para a fila de jobs do destinatário
- Mensagens são recuperadas entre steps da execução
- Suporte opcional de timeout para simulação de respostas síncronas

## Memória por Agente

Combinação de três camadas:

**Memória de trabalho (Working Memory)**: Contexto atual do step, injetado automaticamente pelo runtime

**Memória observacional (Observational Memory)**: Reflexões curtas sobre observações do LLM durante runs

**Memória de longo prazo (Long-Term Memory)**:
- Armazenadas em LibSQL (SQLite) + LibSQLVector
- Busca híbrida: vetorial via fastembed + BM25 fulltext
- Grafo de conhecimento construído com GraphRAG
- Arquivo de observações por dia em workspace

## Comunicação com Sistemas Externos

- **Provedores de comunicação**: Conectam agentes a plataformas externas (email, redes sociais, etc)
- **Wake queue**: Quando mensagens chegam, o agente acorda (debounce de 1s, máx 10s)
- **Sincronização de contatos**: Agentes mantêm lista de contatos de cada provedor
- **Armazenamento de mensagens**: Inbound e outbound são persistidos para auditoria

## Tecnologia

**Framework**: Mastra.ai para agentes, workflows e ferramentas

**Banco de dados**: LibSQL (SQLite) para persistência de tudo

**Embeddings**: Fastembed para vetorização de memória

**Busca**: Híbrida via Workspace + GraphRAG

**Processadores**: Input/Output processors automatizam injeção de memória e atualização

## Próximos Estágios (Não Implementados)

Quando sistema estiver operacional e produtos em produção estáveis:

- Ciclo completo de product discovery, ideation, desenvolvimento e deploy
- Geração automática de landing pages e coleta de leads
- Marketing e distribuição em redes/fóruns
- Atendimento de suporte com tickets
- Criação automática de issues de bugs identificados

Critérios para iniciar nova rodada: fluxo de caixa positivo, runway >= 3 meses, MRR em crescimento, menos de 10 issues/semana.
