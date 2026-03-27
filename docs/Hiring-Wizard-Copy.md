# Hiring Wizard Copy — forge-admin

> Copy completo para o wizard de contratação de agents (#242).
> 5 steps: Basic Info → Configuration → Contract → Review → Confirm

---

## 1. Visão Geral do Wizard

### Estrutura de Navegação

```
[1. Básico] → [2. Configuração] → [3. Contract] → [4. Revisão] → [5. Confirmação]
    ●              ○                  ○              ○              ○
```

### Regras de Capitalização

| Elemento | Estilo | Exemplo |
|----------|--------|---------|
| Step titles | Title Case | "Basic Info" |
| Field labels | Sentence case | "Nome do agent" |
| Field placeholders | lowercase | "ex: vox-brand-voice" |
| Buttons | Title Case | "Próximo" |
| Descriptions | Sentence case | "Configure as informações básicas." |

---

## 2. Step 1: Basic Info (Informações Básicas)

### Título e Descrição

| Elemento | Copy |
|----------|------|
| **Step title** | Basic Info |
| **Step description** | Configure as informações básicas do agent. |
| **Progress indicator** | Step 1 de 5 |

### Campos do Formulário

| Campo | Label | Placeholder | Help text | Validação |
|-------|-------|-------------|-----------|-----------|
| agentName | "Agent name" | "ex: vox-brand-voice" | "Nome único no sistema. 3-50 caracteres." | Obrigatório, único |
| function | "Function" | "Selecione uma função" | "Define permissões e ferramentas disponíveis." | Obrigatório |
| description | "Description" | "Descreva o propósito deste agent..." | — | Opcional, max 500 chars |

### Opções de Function

| Option | Label | Descrição curta |
|--------|-------|-----------------|
| `copywriter` | Copywriter | Gera textos de marketing |
| `researcher` | Researcher | Pesquisa e análise de dados |
| `developer` | Developer | Escreve e revisa código |
| `support` | Support | Atende e resolve dúvidas |
| `analyst` | Analyst | Analisa métricas e relatórios |
| `general` | General | Propósito flexível |

### Estados do Campo

| Estado | Placeholder | Comportamento |
|--------|-------------|---------------|
| Default | "ex: vox-brand-voice" | — |
| Focused | — | Border azul |
| Filled | "vox-brand-voice" | Valor inserido |
| Error | "Nome é obrigatório" | Border vermelho |
| Error (inválido) | "Use apenas letras, números e hífens" | Border vermelho |

### Copy de Validação

| Validação | Mensagem |
|-----------|----------|
| Obrigatório | "Nome é obrigatório" |
| Min caracteres | "Nome precisa ter pelo menos 3 caracteres" |
| Max caracteres | "Nome pode ter no máximo 50 caracteres" |
| Caracteres inválidos | "Use apenas letras, números e hífens" |
| Já existe | "Este nome já está em uso" |

### Botões

| Botão | Label | Posição |
|-------|-------|---------|
| Cancel | "Cancelar" | Esquerda |
| Next | "Próximo" | Direita |

---

## 3. Step 2: Configuration (Configuração)

### Título e Descrição

| Elemento | Copy |
|----------|------|
| **Step title** | Configuration |
| **Step description** | Configure o modelo de IA e instruções do agent. |
| **Progress indicator** | Step 2 de 5 |

### Campos do Formulário

| Campo | Label | Placeholder | Help text |
|-------|-------|-------------|-----------|
| model | "Modelo" | "Selecione o modelo" | "gpt-4o, gpt-4o-mini, claude-3-5..." |
| instructions | "Instructions" | "Descreva o que este agent deve fazer..." | "Seja específico sobre responsabilidades e comportamento." |
| workspace | "Workspace" | "Selecione um workspace" | "Diretório de trabalho para arquivos e memória." |

### Opções de Modelo

| Option | Label | Descrição | Indicador de custo |
|--------|-------|-----------|-------------------|
| `gpt-4o` | GPT-4o | Mais capaz, mais caro | 💰💰💰 |
| `gpt-4o-mini` | GPT-4o Mini | Bom custo-benefício | 💰💰 |
| `gpt-4-turbo` | GPT-4 Turbo | Rápido e capaz | 💰💰 |
| `claude-3-5-sonnet` | Claude 3.5 Sonnet | Excelente raciocínio | 💰💰 |
| `claude-3-5-haiku` | Claude 3.5 Haiku | Rápido, econômico | 💰 |

### Estados do Campo Instructions

| Estado | Placeholder | Comportamento |
|--------|-------------|---------------|
| Default | "Descreva o que este agent deve fazer..." | — |
| Focused | — | Border azul |
| Filled | "You are a copywriter specializing in..." | — |
| Error (min) | "Mínimo 50 caracteres necessários" | Border vermelho |

### Tooltips de Help

| Campo | Tooltip |
|-------|---------|
| model | "Modelo de IA usado para gerar respostas." |
| instructions | "Instruções detalhadas que guiam o comportamento do agent." |
| workspace | "Espaço de armazenamento para arquivos e memória persistente." |

### Copy de Validação

| Validação | Mensagem |
|-----------|----------|
| Obrigatório (model) | "Selecione um modelo" |
| Obrigatório (instructions) | "Instructions são obrigatórias" |
| Min caracteres | "Mínimo 50 caracteres necessários" |
| Max caracteres | "Máximo 5000 caracteres" |

### Botões

| Botão | Label | Posição |
|-------|-------|---------|
| Back | "Voltar" | Esquerda |
| Next | "Próximo" | Direita |

---

## 4. Step 3: Contract (Budget)

### Título e Descrição

| Elemento | Copy |
|----------|------|
| **Step title** | Contract |
| **Step description** | Defina o budget e schedule do agent. |
| **Progress indicator** | Step 3 de 5 |

### Campos do Formulário

| Campo | Label | Placeholder | Help text |
|-------|-------|-------------|-----------|
| budgetAmount | "Budget semanal" | "R$ 0,00" | "Valor máximo que o agent pode gastar." |
| schedule | "Schedule" | "Sob demanda" | "Frequência de execução do agent." |

### Opções de Schedule

| Option | Label | Descrição |
|--------|-------|-----------|
| `on_demand` | Sob demanda | Executa quando acordado manualmente |
| `hourly` | A cada hora | Executa uma vez por hora |
| `daily` | Diariamente | Executa uma vez por dia |
| `weekly` | Semanalmente | Executa uma vez por semana |
| `custom` | Customizado | Defina sua própria frequência |

### Warning de Budget

> 💰 **Atenção:** gpt-4o pode consumir R$ 5-20/hora dependendo do uso. Monitore o consumo em Financeiro.

### Copy de Validação

| Validação | Mensagem |
|-----------|----------|
| Obrigatório | "Budget é obrigatório" |
| Min valor | "Budget mínimo: R$ 1,00" |
| Max valor | "Budget máximo: R$ 50.000,00" |
| Formato inválido | "Use valores numéricos (ex: 50.00)" |

### Botões

| Botão | Label | Posição |
|-------|-------|---------|
| Back | "Voltar" | Esquerda |
| Next | "Próximo" | Direita |

---

## 5. Step 4: Review (Revisão)

### Título e Descrição

| Elemento | Copy |
|----------|------|
| **Step title** | Review |
| **Step description** | Revise as informações antes de confirmar. |
| **Progress indicator** | Step 4 de 5 |

### Seções de Revisão

```
┌─────────────────────────────────────────┐
│ 📋 Informações Básicas                  │
├─────────────────────────────────────────┤
│ Nome           vox-brand-voice           │
│ Função        Copywriter                │
│ Descrição     Agent responsável por...  │
│                              [Editar]   │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ ⚙️ Configuração                         │
├─────────────────────────────────────────┤
│ Modelo         GPT-4o Mini               │
│ Workspace      production               │
│                              [Editar]   │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ 💰 Contract                             │
├─────────────────────────────────────────┤
│ Budget semanal   R$ 50,00               │
│ Schedule        Sob demanda             │
│                              [Editar]   │
└─────────────────────────────────────────┘
```

### Copy dos Botões de Editar

| Ação | Label |
|------|-------|
| Editar Basic Info | "Editar" (no card de Basic Info) |
| Editar Configuration | "Editar" (no card de Configuration) |
| Editar Contract | "Editar" (no card de Contract) |

### Estimativa de Custo

| Campo | Copy |
|-------|------|
| Título | "Estimativa de custo" |
| Description | "Baseado no usage pattern típico, este agent pode custar aproximadamente R$ {{estimate}}/semana." |

### Botões

| Botão | Label | Posição |
|-------|-------|---------|
| Back | "Voltar" | Esquerda |
| Confirm | "Contratar Agent" | Direita |

---

## 6. Step 5: Confirmation (Confirmação)

### Título e Descrição

| Elemento | Copy |
|----------|------|
| **Step title** | Confirmation |
| **Step description** | Contratação em andamento. |
| **Progress indicator** | Step 5 de 5 |

### Estados de Loading

| Estado | Copy |
|--------|------|
| **Loading** | ⏳ "Contratando agent..." |
| **Loading description** | "Isso pode levar alguns segundos." |
| **Spinner text** | "Inicializando workspace..." |

### Estado de Sucesso

| Elemento | Copy |
|----------|------|
| **Icon** | ✅ |
| **Title** | "Agent contratado com sucesso!" |
| **Description** | "{{agentName}} está inicializando. Isso pode levar alguns minutos." |
| **Agent status** | "Status: Provisioning" |

### Ações pós-sucesso

| Botão | Label | Link/Ação |
|-------|-------|-----------|
| Primary | "Ver Runtime" | Navigate to `/agents/$agentId/runtime` |
| Secondary | "Voltar para Agents" | Navigate to `/agents` |

### Estado de Erro

| Elemento | Copy |
|----------|------|
| **Icon** | ❌ |
| **Title** | "Falha ao contratar agent" |
| **Description** | "{{errorReason}}" |
| **Error reason examples** | |
| Budget insuficiente | "Budget insuficiente. Aumente o budget para continuar." |
| Workspace inválido | "Workspace não encontrado. Selecione um workspace válido." |
| Provider offline | "Provider offline. Tente novamente mais tarde." |

### Ações pós-erro

| Botão | Label | Ação |
|-------|-------|------|
| Retry | "Tentar novamente" | Retry hiring |
| Edit budget | "Ajustar budget" | Navigate back to Step 3 |
| Cancel | "Cancelar" | Navigate to `/agents` |

---

## 7. Empty States

| Contexto | Copy |
|----------|------|
| Sem functions disponíveis | "Nenhuma função disponível. Configure Functions em Sistema." |
| Sem workspaces disponíveis | "Nenhum workspace disponível. Crie um workspace primeiro." |
| Sem modelos disponíveis | "Nenhum modelo disponível. Verifique a configuração." |

---

## 8. Copy de Cancelamento

### Modal de Confirmação

| Elemento | Copy |
|----------|------|
| **Title** | "Cancelar contratação?" |
| **Description** | "As informações preenchidas serão perdidas." |
| **Confirm button** | "Sim, cancelar" |
| **Cancel button** | "Continuar preenchendo" |

---

## 9. Version History

| Versão | Data | Mudanças |
|--------|------|---------|
| 1.0 | 2026-03-27 | Versão inicial com copy completo para todos os 5 steps |

---

*Documento mantido por: Vox (Brand Voice)*
