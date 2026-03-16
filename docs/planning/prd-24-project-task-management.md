# PRD-24: Integração de Sistema de Projetos & Tarefas

> **Nota:** Este PRD é sobre **integração** com uma ferramenta existente, não desenvolvimento de um sistema próprio.

**Classificação:** APLICAÇÃO AD-PRODUCT-FORGE

---

## 1. Visão Geral

### Objetivo

Fornecer aos agentes um sistema de **gerenciamento de projetos e tarefas** que eles possam usar para organizar e rastrear trabalho.

### Abordagem

**Não desenvolver do zero.** Usar uma ferramenta existente que:
- Tenha **MCP (Model Context Protocol) pronto** para integração com LLMs
- Ou tenha **CLIs (Command-Line Interfaces)** bem documentadas
- Seja facilmente integrada como Tool/Workflow Mastra

### Candidatas

Exemplos de ferramentas que poderiam funcionar:
- **Linear** (tem MCP, GraphQL API, bom para agentes)
- **Airtable** (API forte, automações)
- **Notion** (MCP disponível, bases de dados)
- **GitHub Projects** (integrado com GitHub, CLI disponível)
- **Todoist** (API simples, CLI)

### Critério de Seleção

Escolher ferramenta que:
1. Tenha integração pronta (MCP ou CLI robusto)
2. Suporte criar projetos e tarefas programaticamente
3. Permita rastreamento de status
4. Tenha API para consultas (listar, filtrar)
5. Seja razoavelmente simples de usar

---

## 2. Funcionalidades Esperadas

Os agentes devem conseguir:

- **Criar projetos** — Organizar trabalho em grupos
- **Criar tarefas** — Dentro de projetos, com descrição
- **Rastrear status** — to-do, in-progress, done (ou equivalente)
- **Listar/filtrar** — Por projeto, status, data
- **Atualizar tarefas** — Mudar status, descrição, prioridade
- **Consultar dados** — Para usar em relatórios ou decisões

---

## 3. Integração com Mastra

### Como Será Exposto aos Agentes

**Opção A: Via MCP**
- Se a ferramenta tiver MCP, expor diretamente como Tool via MCP integration
- Mastra consome MCP e disponibiliza ao agente

**Opção B: Via CLI com Wrapper**
- Se tiver CLI, criar wrapper Tool que executa comandos CLI
- Exemplo: `runTaskCLI("linear create-task --title 'X' --project 'Y'")`

**Opção C: Via API com Tool Custom**
- Se tiver API, criar Tool que chama endpoints
- Validar e sanitizar inputs

---

## 4. Processo de Decisão

1. **Pesquisar** ferramentas que atendem os critérios
2. **Avaliar** qual tem melhor integração (MCP vs CLI vs API)
3. **Testar** integração com Mastra
4. **Documentar** como agentes usam
5. **Treinar** agentes a usar

---

## 5. Não Fazer

- ❌ **Não desenvolver sistema próprio** de projetos/tarefas
- ❌ **Não replicar** funcionalidades de ferramentas existentes
- ❌ **Não criar API** proprietária desnecessária

---

## 6. Critério de Sucesso

- [ ] Ferramenta escolhida e avaliada
- [ ] Integração com Mastra funciona
- [ ] Agentes conseguem criar/listar/atualizar projetos e tarefas
- [ ] Dados persistem na ferramenta (não localmente)
- [ ] Documentação clara para agentes

---

**Fim do documento**
