# Empty States — forge-admin

> Copy e padrões para estados vazios no forge-admin UI.
> Nielsen Heuristic #6 (Recognition vs Recall) — facilitar reconhecer em vez de lembrar.

---

## 1. Visão Geral

Empty states aparecem quando uma página/lista não tem dados. São oportunidades para orientar o usuário e reduzir ansiedade.

### Tipos de Empty State

| Tipo | Quando Appears | Objetivo |
|------|----------------|----------|
| **Initial** | Primeira vez, sem dados | Orientar e engajar |
| **No Results** | Busca/filtro sem resultado | Explicar e ajudar |
| **Cleared** | Usuário limpou filtros | Recuperar contexto |
| **Error** | Falha ao carregar dados | Alertar e recovery |

---

## 2. Estrutura do Empty State

```
┌─────────────────────────────────────────┐
│                                         │
│              [Icon/Ilustração]          │
│                                         │
│         Título descritivo               │
│                                         │
│      Descrição curta + contexto         │
│                                         │
│         [CTA Primary Button]            │
│         [CTA Secondary Link]            │
│                                         │
└─────────────────────────────────────────┘
```

### Anatomia

| Elemento | Tamanho | Copy Guidelines |
|----------|---------|-----------------|
| Icon | 48x48px | Usar ícone relacionado ao domínio |
| Título | 20px/bold | 3-6 palavras, ação positiva |
| Descrição | 14px | 1-2 linhas, explicar contexto |
| CTA Primary | — | Primeira ação recomendada |
| CTA Secondary | — | Alternativa ou ajuda |

---

## 3. Empty States por Página

### 3.1 Agents Page — Sem Agents

```
┌─────────────────────────────────────────────────┐
│                                                 │
│                   🤖                            │
│                                                 │
│              No agents yet                      │
│                                                 │
│    You haven't hired any agents. Agents are     │
│    team members that run tasks automatically.   │
│                                                 │
│            [Hire your first agent]              │
│                                                 │
│         Learn more about agents →               │
│                                                 │
└─────────────────────────────────────────────────┘
```

| Elemento | Copy |
|----------|------|
| Icon | 🤖 (bot emoji) |
| Title | "No agents yet" |
| Description | "You haven't hired any agents. Agents are team members that run tasks automatically." |
| CTA Primary | "Hire your first agent" |
| CTA Secondary | "Learn more about agents →" |

### 3.2 Agents List — Empty Search

```
┌─────────────────────────────────────────────────┐
│                                                 │
│                   🔍                            │
│                                                 │
│              No agents found                    │
│                                                 │
│    No agents match your search. Try different  │
│    keywords or clear the filters.              │
│                                                 │
│               [Clear filters]                  │
│                                                 │
└─────────────────────────────────────────────────┘
```

| Elemento | Copy |
|----------|------|
| Title | "No agents found" |
| Description | "No agents match your search. Try different keywords or clear the filters." |
| CTA | "Clear filters" |

### 3.3 Schedules — Sem Schedules

```
┌─────────────────────────────────────────────────┐
│                                                 │
│                   📅                            │
│                                                 │
│              No schedules yet                   │
│                                                 │
│    Schedules let you run agents automatically   │
│    at set times. Create your first one.        │
│                                                 │
│             [Create schedule]                   │
│                                                 │
└─────────────────────────────────────────────────┘
```

| Elemento | Copy |
|----------|------|
| Icon | 📅 (calendar emoji) |
| Title | "No schedules yet" |
| Description | "Schedules let you run agents automatically at set times. Create your first one." |
| CTA | "Create schedule" |

### 3.4 Finance — Sem Transações

```
┌─────────────────────────────────────────────────┐
│                                                 │
│                   💰                            │
│                                                 │
│            No transactions yet                 │
│                                                 │
│    Your agent spending will appear here once    │
│    they start running tasks.                   │
│                                                 │
│              [View agents →]                    │
│                                                 │
└─────────────────────────────────────────────────┘
```

| Elemento | Copy |
|----------|------|
| Icon | 💰 (money emoji) |
| Title | "No transactions yet" |
| Description | "Your agent spending will appear here once they start running tasks." |
| CTA | "View agents →" |

### 3.5 Runtime Logs — Empty Logs

```
┌─────────────────────────────────────────────────┐
│                                                 │
│                   📋                            │
│                                                 │
│               No logs yet                       │
│                                                 │
│    Activity logs will appear here when the      │
│    agent starts running.                        │
│                                                 │
└─────────────────────────────────────────────────┘
```

| Elemento | Copy |
|----------|------|
| Icon | 📋 (clipboard emoji) |
| Title | "No logs yet" |
| Description | "Activity logs will appear here when the agent starts running." |

### 3.6 Memory — Empty Memory

```
┌─────────────────────────────────────────────────┐
│                                                 │
│                   🧠                            │
│                                                 │
│              No memories yet                    │
│                                                 │
│    Memories are what the agent has learned      │
│    from past interactions.                      │
│                                                 │
└─────────────────────────────────────────────────┘
```

| Elemento | Copy |
|----------|------|
| Icon | 🧠 (brain emoji) |
| Title | "No memories yet" |
| Description | "Memories are what the agent has learned from past interactions." |

---

## 4. Empty States de Erro

### 4.1 Falha ao Carregar Agents

```
┌─────────────────────────────────────────────────┐
│                                                 │
│                   ❌                            │
│                                                 │
│           Couldn't load agents                  │
│                                                 │
│    Something went wrong loading your agents.    │
│    Please try again.                           │
│                                                 │
│              [Try again]                        │
│                                                 │
└─────────────────────────────────────────────────┘
```

| Elemento | Copy |
|----------|------|
| Icon | ❌ |
| Title | "Couldn't load agents" |
| Description | "Something went wrong loading your agents. Please try again." |
| CTA | "Try again" |

### 4.2 Workspace Não Encontrado

```
┌─────────────────────────────────────────────────┐
│                                                 │
│                   📁                            │
│                                                 │
│           Workspace not found                   │
│                                                 │
│    This workspace doesn't exist or you don't    │
│    have access to it.                          │
│                                                 │
│            [Go back]                            │
│                                                 │
└─────────────────────────────────────────────────┘
```

| Elemento | Copy |
|----------|------|
| Icon | 📁 |
| Title | "Workspace not found" |
| Description | "This workspace doesn't exist or you don't have access to it." |
| CTA | "Go back" |

---

## 5. Copy Templates

### Título

| Situação | Template | Exemplo |
|----------|----------|---------|
| Entidade nova | "No {{entities}} yet" | "No agents yet" |
| Busca vazia | "No {{entities}} found" | "No agents found" |
| Erro | "Couldn't load {{entities}}" | "Couldn't load agents" |
| Inexistente | "{{Entity}} not found" | "Workspace not found" |

### Descrição

| Situação | Template | Exemplo |
|----------|----------|---------|
| Orientação | "{{Description of entity}}." | "Agents are team members that run tasks." |
| Ação necessária | "{{Action context}}." | "Your spending will appear here once..." |
| Recovery | "{{Error context}}. {{Recovery instruction}}." | "Something went wrong. Please try again." |

### CTA

| Situação | Template | Exemplo |
|----------|----------|---------|
| Criar primeiro | "Create your first {{entity}}" | "Hire your first agent" |
| Ações disponíveis | "{{Verb}} {{entity}}" | "Create schedule" |
| Navegação | "View {{entities}} →" | "View agents →" |
| Recovery | "{{Action}}" | "Try again" |
| Ajuda | "Learn more about {{topic}} →" | "Learn more about agents →" |

---

## 6. Ilustrações e Icons

| Página | Emoji | shadcn/ui Icon |
|--------|-------|----------------|
| Agents | 🤖 | Bot |
| Schedules | 📅 | Calendar |
| Finance | 💰 | CreditCard |
| Logs | 📋 | ScrollText |
| Memory | 🧠 | Brain |
| Error | ❌ | AlertCircle |
| Workspace | 📁 | Folder |
| Search | 🔍 | Search |

---

## 7. Version History

| Versão | Data | Mudanças |
|--------|------|---------|
| 1.0 | 2026-03-27 | Versão inicial com empty states para todas as páginas principais |

---

*Documento mantido por: Vox (Brand Voice)*
