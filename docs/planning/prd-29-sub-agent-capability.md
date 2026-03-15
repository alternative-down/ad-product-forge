# PRD-29: Capacidade de Sub-Agente

**Status:** Exploratório
**Data:** 2026-03-15
**Versão:** 1.0

---

## Nota de Projeto Pessoal

Este é um projeto de desenvolvimento pessoal. Recursos seguem princípios KISS (Keep It Simple, Stupid) e YAGNI (You Aren't Gonna Need It). Escopo foca em funcionalidade core para fluxo de trabalho de desenvolvedor solo.

---

## 1. Visão Geral

### Classificação: APLICAÇÃO AD-PRODUCT-FORGE

**Este PRD descreve infraestrutura de otimização de custo específica do ad-product-forge.** Capacidade de sub-agente permite que Nicolas reduza custos operacionais delegando tarefas simples a modelos mais baratos. Esta é otimização específica da aplicação, não infraestrutura de framework.

**Objetivo:** Permitir que agentes deleguem tarefas simples a sub-agentes mais baratos (Haiku) para redução de custo.

**Por que (para ad-product-forge):** Otimizar custo usando modelos mais baratos para tarefas simples enquanto mantém agente primário (Opus) para raciocínio complexo. Essencial para lucratividade da plataforma autônoma de Nicolas conforme escala.

**Prioridade:** Baixa (exploração opcional)
**Status:** Requer avaliação de viabilidade antes de implementação

---

## 2. Problema

- Todas tarefas executam no modelo Opus caro independentemente de complexidade
- Tarefas simples (coleta de dados, formatação) gastam orçamento caro de token
- Trabalho paralelizável executa sequencialmente
- Nenhuma consciência de custo em fluxos de trabalho de agente

---

## 3. Conceito Chave

**Sub-Agente:** Agente temporário spawned por agente primário para tarefas simples.

- **Ciclo de Vida:** Criado on-demand, executa tarefa, termina
- **Modelo:** Haiku (3-5x mais barato que Opus)
- **Escopo:** Tarefa única, simples
- **Comunicação:** Síncrono request-response

---

## 4. Casos de Uso

1. **Análise de Documento em Lote:** Agente primário spawns 10 sub-agentes Haiku para analisar 10 documentos em paralelo, então sintetiza resultados
2. **Coleta de Dados:** Agente primário spawns 3 sub-agentes para buscar dados de diferentes fontes simultaneamente
3. **Pré-processamento de Conteúdo:** Sub-agentes limpam e normalizam dados de input antes que agente primário analise

---

## 5. Sub-Agente vs. Agente Externo

**Distinção Crítica:**

| Aspecto | Sub-Agentes | Agentes Externos |
|--------|-----------|-----------------|
| **Propósito** | Otimizar custo tarefas simples | Isolamento de segurança para interação externa |
| **Tier de Modelo** | Haiku (barato) | Opus (foco em qualidade) |
| **Ciclo de Vida** | Curta-vida, escopo de tarefa | Longa-vida, conversacional |
| **Modo de Falha** | Degrade graciosamente | Pode terminar tarefa |

---

## 6. Requisitos

### Características Core

**FR1: Criação de Sub-Agente**
- Ferramenta: `spawnSubAgent(taskName, taskDescription, taskInput, options)`
- Validação de input e especificação de tarefa
- Criar agente Haiku temporário com prompt específico de tarefa

**FR2: Execução & Resultados**
- Executar tarefa sincronamente
- Retornar: status, resultado, tokens usados, tempo de execução
- Manipular timeout e erros graciosamente

**FR3: Tratamento de Erro**
- Proteção de timeout (padrão: 30 segundos)
- Lógica de retry para falhas transitórias
- Degradação gracioso se sub-agente falhar

### Ferramenta Voltada para Agente

```typescript
spawnSubAgent({
  taskName: string;
  taskDescription: string;
  taskInput: Record<string, unknown>;
  maxTokens?: number;
  timeoutSeconds?: number;
}): Promise<{
  status: "success" | "failed" | "timeout";
  result?: unknown;
  error?: string;
  tokensUsed: number;
  executionTimeMs: number;
}>
```

---

## 7. Critérios de Sucesso

- Sub-agentes criados e executados com sucesso
- Custo por tarefa reduzido quando usando sub-agentes
- Falha de sub-agente não crasheia agente primário
- Documentação clara em quando usar sub-agentes vs. agente primário

---

## 8. Requisitos Não-Funcionais

**Performance:**
- Criação de sub-agente: latência razoável
- Execução de tarefa: confiável

**Confiabilidade:**
- Sub-agentes falhados retornam erro claro
- Agente primário continua em falha de sub-agente

**Custo:**
- Uso de Haiku: 3-5x mais barato que Opus

---

## 9. Escopo

### Incluído (se aprovado)
- Criação e execução de sub-agente
- Modelo de execução síncrono
- Tratamento de erro e lógica de retry
- Documentação clara distinguindo de agentes externos

### Não Incluído
- Execução em lote/paralela
- Sub-agentes aninhados (sub-agentes spawning sub-agentes)
- Execução distribuída
- Decomposição avançada de tarefa
- Cache de resultado de sub-agente
- Rastreamento de custo e analytics

---

## 10. Métricas de Sucesso

- Custo reduzido para tarefas simples
- Latência aceitável de criação de sub-agente
- Nenhum impacto em capacidades de agente primário
- Documentação clara e exemplos

---

**Status:** Aguardando avaliação de viabilidade
**Próxima Revisão:** Após conclusão de fase de viabilidade
