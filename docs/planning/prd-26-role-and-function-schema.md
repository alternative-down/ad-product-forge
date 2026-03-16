# PRD-26: Schema de Papel e Função

**Status:** Planejamento

**Data:** 2026-03-15

**Nota:** Este é um projeto pessoal de um desenvolvedor solo. Construído com princípios KISS (Keep It Simple, Stupid) e YAGNI (You Aren't Gonna Need It) em mente.

---

## Resumo Executivo

### Classificação: FRAMEWORK MASTRA

**Implementar sistema de papéis e funções para controle de acesso e organização interna de agentes.**

**Objetivo:** Determinar o que cada agente pode fazer (Tools, Providers, Workflows, Operações).

---

## Conceitos

**Função:** Agrupador organizacional (Marketing, Sales, Ops, Development, Research)
- Agente está vinculado a UMA função

**Papel:** Definição de permissões e capacidades
- Acesso a Tools
- Acesso a Providers
- Acesso a Workflows
- Operações permitidas

---

## Fluxo

1. **Master Agent:** Tem permissão irrestrita
   - Inicializa sistema
   - Cria funções base
   - Cria papéis base

2. **Master Agent libera acesso:**
   - Cria novos agentes com papel específico
   - Atribui função organizacional

3. **Agentes com permissão:**
   - Conseguem criar/modificar papéis e funções
   - Conseguem atribuir papéis a outros agentes
   - Conseguem mudar função de agente

---

## Schema Básico

**agents:**
- agent_id
- function_id (FK)
- role_id (FK)
- is_active

**functions:**
- function_id
- name (Marketing, Sales, Ops, etc)
- description

**roles:**
- role_id
- name
- description

**role_permissions:**
- role_id (FK)
- tool_id
- provider_id
- workflow_id
- operation (can_create, can_read, can_update, can_delete)

---

## Critérios de Sucesso

- [ ] Master agent criado com permissão irrestrita
- [ ] Agentes conseguem ter papéis/funções
- [ ] Permissões verificadas em acesso a tools/providers
- [ ] Agentes com permissão conseguem gerenciar papéis/funções
- [ ] Sem impacto em operações existentes

---

## Dependências

- PRD-01: Agent system (agentes persistidos)
- Banco de dados (papéis, funções, permissões)

---

**Histórico do Documento:**
- v1.0 (2026-03-15): Sistema de papéis (permissões) e funções (agrupador)
