# Loading States — forge-admin

> Padrões de loading states para o forge-admin UI.
> Nielsen Heuristic #1 (Visibility of System Status) — manter usuário informado.

---

## 1. Visão Geral

Loading states comunicam ao usuário que o sistema está processando, evitando frustração e percepção de "app quebrado".

### Tipos de Loading

| Tipo | Duração | Uso |
|------|---------|-----|
| **Skeleton** | Indeterminado | Conteúdo sendo carregado |
| **Spinner** | Indeterminado | Ação do usuário em progresso |
| **Progress Bar** | Determinado | Upload, download, operações longas |
| **Skeleton + Spinner** | Indeterminado | Dados + ação simultânea |

---

## 2. Skeleton Loaders

### 2.1 Agents List Skeleton

```
┌─────────────────────────────────────────────────┐
│ [Avatar]  Agent Name                       ●●● │
│           Status: Running                      │
│           Budget: R$ 50,00/semana               │
├─────────────────────────────────────────────────┤
│ [Avatar]  ████████                         ●●● │
│           ████████                             │
│           ████████                             │
├─────────────────────────────────────────────────┤
│ [Avatar]  ████████                         ●●● │
│           ████████                             │
│           ████████                             │
└─────────────────────────────────────────────────┘
```

**Copy:** Não mostrar copy durante skeleton — layout apenas.

### 2.2 Agent Detail Skeleton

```
┌─────────────────────────────────────────────────┐
│  ┌──────────────┐                               │
│  │    Avatar    │   Agent Name                  │
│  │   (large)    │   Status badge                 │
│  └──────────────┘                               │
├─────────────────────────────────────────────────┤
│  [Tab] [Tab] [Tab] [Tab] [Tab]                  │
├─────────────────────────────────────────────────┤
│                                                 │
│  ████████████████████████████████████████████  │
│  ████████████████████████████████████████████  │
│  ████████████████                              │
│                                                 │
│  ████████████████████████████████████████████  │
│  ████████████████████████████████████████████  │
│                                                 │
└─────────────────────────────────────────────────┘
```

### 2.3 Table Skeleton

```
┌─────────────────────────────────────────────────┐
│ Name              Status      Budget      Acts │
├─────────────────────────────────────────────────┤
│ ████████          ████████    ████████    ●●●  │
│ ████████          ████████    ████████    ●●●  │
│ ████████          ████████    ████████    ●●●  │
└─────────────────────────────────────────────────┘
```

---

## 3. Spinner States

### 3.1 Inline Spinner

**Uso:** Botões, badges de status, ações pequenas

```tsx
<Button disabled>
  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
  Loading...
</Button>
```

### 3.2 Full Page Spinner

**Uso:** Navegação entre páginas, reload completo

```
┌─────────────────────────────────────────────────┐
│                                                 │
│                                                 │
│                                                 │
│                    ⏳                           │
│                                                 │
│              Loading agents...                  │
│                                                 │
│                                                 │
│                                                 │
└─────────────────────────────────────────────────┘
```

| Elemento | Copy |
|----------|------|
| Icon | ⏳ (hourglass) ou spinner animado |
| Text | "Loading..." / "Loading {{entity}}..." |

### 3.3 Table Spinner (Overlay)

**Uso:** Ordenação, filtros, reload de tabela

```
┌─────────────────────────────────────────────────┐
│ Name              Status      Budget      Acts │
├─────────────────────────────────────────────────┤
│ Agent 1           Running     R$ 50,00     ●●●  │
│ Agent 2           Idle        R$ 25,00     ●●●  │
│                                                 │
│          ╔═══════════════════════╗              │
│          ║   ↻ Loading...       ║              │
│          ╚═══════════════════════╝              │
│                                                 │
└─────────────────────────────────────────────────┘
```

### 3.4 Action Spinner

**Uso:** Contratar, salvar, deletar

```
┌─────────────────────────────────────────────────┐
│                                                 │
│                 ⏳ Contracting                  │
│              Please wait...                    │
│                                                 │
└─────────────────────────────────────────────────┘
```

| Contexto | Título | Descrição |
|----------|--------|-----------|
| Hire | "Contratando..." | "Isso pode levar alguns segundos." |
| Save | "Salvando..." | "Aguarde um momento." |
| Delete | "Removendo..." | "Removendo agent." |
| Wake | "Acordando..." | "Agent está inicializando." |
| Stop | "Parando..." | "Agent está sendo encerrado." |

---

## 4. Progress Bar States

### 4.1 Determinate Progress

**Uso:** Upload de arquivo, operação com tempo estimado

```
┌─────────────────────────────────────────────────┐
│  Uploading workspace files...                  │
│                                                 │
│  ████████████████░░░░░░░░░░░░░░░░░░░░░░  45%  │
│                                                 │
│  12 of 27 files uploaded                       │
│                                                 │
│  [Cancel]                                      │
└─────────────────────────────────────────────────┘
```

| Elemento | Copy |
|----------|------|
| Title | "{{Action}}..." | "Uploading workspace files..." |
| Progress | "{{percent}}%" | "45%" |
| Subtitle | "{{count}} of {{total}} {{items}} uploaded" | "12 of 27 files uploaded" |
| Action | "Cancel" | Cancelar operação |

### 4.2 Budget Progress Bar

```
┌─────────────────────────────────────────────────┐
│  Weekly Budget                                  │
│                                                 │
│  ████████████████░░░░░░░░░░░░░░░░░░░░░░  80%   │
│                                                 │
│  R$ 40,00 usado de R$ 50,00                    │
│                                                 │
└─────────────────────────────────────────────────┘
```

| Elemento | Copy |
|----------|------|
| Title | "Weekly Budget" |
| Progress | "{{percent}}%" | "80%" |
| Subtitle | "R$ {{used}} used of R$ {{total}}" | "R$ 40,00 used of R$ 50,00" |

---

## 5. Copy de Loading Contextual

### 5.1 Por Ação

| Ação | Loading Title | Loading Description |
|------|---------------|---------------------|
| Contratar agent | "Contratando agent..." | "Configurando workspace e ferramentas..." |
| Inicializar agent | "Inicializando agent..." | "Isso pode levar alguns minutos." |
| Salvar config | "Salvando..." | "Aguarde um momento." |
| Carregar agents | "Carregando agents..." | — |
| Buscar | "Buscando..." | — |
| Sincronizar | "Sincronizando..." | "Verificando dados..." |
| Memory consolidation | "Salvando memória..." | "Consolidando interações..." |

### 5.2 Por Entidade

| Entidade | Loading Title |
|----------|---------------|
| Agents | "Carregando agents..." |
| Schedules | "Carregando schedules..." |
| Transactions | "Carregando transações..." |
| Logs | "Carregando logs..." |
| Memory | "Carregando memórias..." |
| Config | "Carregando configuração..." |

---

## 6. Timeout e Error Handling

### 6.1 Loading Demorado (>5s)

```
┌─────────────────────────────────────────────────┐
│                                                 │
│                  ⏳                             │
│                                                 │
│              Still working...                  │
│                                                 │
│    This is taking longer than expected.         │
│    We're doing something complex.              │
│                                                 │
│    [Continue waiting]  [Cancel]                 │
│                                                 │
└─────────────────────────────────────────────────┘
```

| Elemento | Copy |
|----------|------|
| Title | "Still working..." |
| Description | "This is taking longer than expected. We're doing something complex." |
| CTA Primary | "Continue waiting" |
| CTA Secondary | "Cancel" |

### 6.2 Loading Failed

```
┌─────────────────────────────────────────────────┐
│                                                 │
│                   ❌                            │
│                                                 │
│              Couldn't load                      │
│                                                 │
│    Something went wrong. Please try again.     │
│                                                 │
│              [Try again]                        │
│                                                 │
└─────────────────────────────────────────────────┘
```

| Elemento | Copy |
|----------|------|
| Icon | ❌ |
| Title | "Couldn't load" |
| Description | "Something went wrong. Please try again." |
| CTA | "Try again" |

---

## 7. UX Guidelines

### Skeleton vs Spinner

| Critério | Skeleton | Spinner |
|----------|----------|---------|
| Tempo estimado | < 3s | Qualquer |
| Conteúdo estruturado | Sim | Não |
| Ações do usuário bloqueadas | Não | Sim |
| Placeholder visual | Sim | Não |

### Regras de Copy

| Regra | ❌ Evitar | ✅ Preferir |
|-------|----------|-------------|
| Seja específico | "Loading..." | "Loading agents..." |
| Indique o que vem | — | "Loading agents... You'll see the list shortly." |
| Não多久 | "Please wait..." | "Usually takes a few seconds" |
| Contextualize | "Processing..." | "Hiring Vox-brand-voice..." |

### Duração Ideal

| Tipo | Ideal | Máximo |
|------|-------|--------|
| Skeleton | Instantâneo | — |
| Spinner inline | < 2s | 5s |
| Full page | < 3s | 10s |
| Progress | — | Conforme necessário |

---

## 8. Version History

| Versão | Data | Mudanças |
|--------|------|---------|
| 1.0 | 2026-03-27 | Versão inicial com skeleton, spinner, progress bar e templates |

---

*Documento mantido por: Vox (Brand Voice)*
