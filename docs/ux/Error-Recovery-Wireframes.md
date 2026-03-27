# Error Recovery UX Wireframes
## Nielsen's Heuristic #9 - Quick Win Improvement

**Issue Reference:** Issue #241 (UX Review - forge-admin Heuristic Analysis)  
**Priority:** Quick Win #4 (previously scored 4/10)  
**Target Score:** 8/10  
**Branch:** `feat/ux-error-recovery-wireframes` → `develop`

---

## Overview

Nielsen's Heuristic #9 states: **"Help users recognize, diagnose, and recover from errors"**

Current score: **4/10** - Error messages exist but lack actionable recovery paths and contextual guidance.

---

## Problem Analysis

### Current State Issues:
1. Error messages are generic (e.g., "An error occurred")
2. No clear recovery actions provided
3. Users must navigate back manually after errors
4. No distinction between recoverable vs. non-recoverable errors
5. Error history not visible for troubleshooting

---

## Wireframe Components

### 1. ErrorCard Component

**Purpose:** Replace generic error alerts with contextual, actionable error cards

```
┌─────────────────────────────────────────────────────────────┐
│  ⚠️  Erro ao carregar agentes                               │
│                                                             │
│  Não foi possível carregar a lista de agentes.              │
│  Isso pode acontecer quando há muitos agentes ativos.       │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │  🔄 Tentar    │  │  📋 Ver      │  │  🏠 Ir para   │    │
│  │    novamente  │  │    logs      │  │    Início     │    │
│  └──────────────┘  └──────────────┘  └──────────────┘    │
│                                                             │
│  ID do erro: ERR-2024-03-27-001                            │
└─────────────────────────────────────────────────────────────┘
```

**Component Props:**
```typescript
interface ErrorCardProps {
  title: string;
  message: string;
  errorId?: string;
  actions: ErrorAction[];
  severity: 'warning' | 'error' | 'critical';
  timestamp?: Date;
  onRetry?: () => void;
  onViewLogs?: () => void;
  onGoHome?: () => void;
}
```

---

### 2. ErrorBoundary Component

**Purpose:** Wrap critical sections with error boundaries that show recovery options

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│     ┌─────────────────────────────────────────────┐        │
│     │                                             │        │
│     │            🖥️  Ops! Algo deu errado        │        │
│     │                                             │        │
│     │  Este componente encontrou um problema.    │        │
│     │  Seus dados foram preservados.             │        │
│     │                                             │        │
│     │  ┌─────────────────────────────────────┐  │        │
│     │  │  🔄 Recarregar apenas este componente│  │        │
│     │  └─────────────────────────────────────┘  │        │
│     │                                             │        │
│     │  ┌─────────────────────────────────────┐  │        │
│     │  │  🏠 Voltar para a página inicial    │  │        │
│     │  └─────────────────────────────────────┘  │        │
│     │                                             │        │
│     │  Cod: ERR-BOUNDARY-001                    │        │
│     │                                             │        │
│     └─────────────────────────────────────────────┘        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**States:**
- **Recoverable:** Show retry button, data preserved
- **Non-recoverable:** Show navigation options, offer to report
- **Partial failure:** Show what worked, what failed

---

### 3. InlineFieldError Component

**Purpose:** Show field-level errors with specific recovery guidance

```
┌─────────────────────────────────────────────────────────────┐
│  Nome do Agent *                                            │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 🔴 Agent Alpha                                        │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ ⚠️  Nome já existe. Escolha outro ou adicione        │   │
│  │     um sufixo (ex: Agent Alpha 2).                   │   │
│  │                                                      │   │
│  │     Sugestões:                                       │   │
│  │     • Agent Alpha 1                                  │   │
│  │     • Agent Alpha (Backup)                            │   │
│  │     • Meu Agent Alpha                                 │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

**Component Props:**
```typescript
interface InlineFieldErrorProps {
  fieldName: string;
  errorCode: string;
  suggestions?: string[];
  onSuggestionClick?: (suggestion: string) => void;
}
```

---

### 4. ErrorToast Component

**Purpose:** Non-blocking error notifications with quick actions

```
┌─────────────────────────────────────────────────────────────┐
│  🔴  Erro ao salvar alterações                              │
│      Não foi possível salvar. Verifique sua conexão.       │
│                                                             │
│  ┌──────────┐                                              │
│  │  🔄 Tentar │   ✕                                          │
│  └──────────┘                                              │
└─────────────────────────────────────────────────────────────┘
```

**Behavior:**
- Auto-dismiss after 10 seconds (longer than success toasts)
- "Tentar" button triggers retry
- Click X to dismiss
- Stacks if multiple errors

---

### 5. RecoveryWizard Component

**Purpose:** Step-by-step recovery for complex error scenarios

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  🔧  Assistente de Recuperação                             │
│                                                             │
│  ┌─────┐  ┌─────┐  ┌─────┐  ┌─────┐                        │
│  │  1  │─▶│  2  │─▶│  3  │─▶│  ✓  │                        │
│  │ ●   │  │ ○   │  │ ○   │  │     │                        │
│  └─────┘  └─────┘  └─────┘  └─────┘                        │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  Etapa 1: Verificar conexão                                │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                                                      │   │
│  │  ✓  Conexão com servidor: OK                        │   │
│  │  ✓  Autenticação: OK                               │   │
│  │  ⚠️  Timeout detectado (5s)                        │   │
│  │                                                      │   │
│  │  Tempo médio de resposta: 5.2s                      │   │
│  │  Limite configurado: 3s                             │   │
│  │                                                      │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  Possível causa: Servidor sobrecarregado                    │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  ▶  Tentar com timeout maior (30s)                  │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌──────────────┐              ┌──────────────┐            │
│  │  ← Voltar   │              │   Avançar →  │            │
│  └──────────────┘              └──────────────┘            │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Recovery Scenarios:**
1. **Timeout errors:** Increase timeout, retry, check connection
2. **Validation errors:** Highlight fields, show suggestions
3. **Auth errors:** Redirect to login, preserve form data
4. **Server errors:** Show status, suggest retry time

---

### 6. ErrorHistoryPanel Component

**Purpose:** Show recent errors for troubleshooting

```
┌─────────────────────────────────────────────────────────────┐
│  📋  Histórico de Erros                                     │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  🔴  Hoje, 10:42                                    │   │
│  │  Erro ao carregar agentes                            │   │
│  │  ERR-2024-03-27-001  •  Rede                        │   │
│  │  [Tentar novamente]                                  │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  🟡  Hoje, 10:38                                    │   │
│  │  Timeout ao salvar configurações                     │   │
│  │  ERR-2024-03-27-002  •  Timeout                     │   │
│  │  [Ver detalhes]                                     │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  ⚪  Hoje, 10:15                                    │   │
│  │  Validação falhou ( campo obrigatório)               │   │
│  │  ERR-2024-03-27-003  •  Validação                   │   │
│  │  Resolvido automaticamente                           │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  [Limpar histórico]                                         │
└─────────────────────────────────────────────────────────────┘
```

**Features:**
- Filter by severity, date, error type
- Click to expand error details
- Retry action for each error
- Copy error ID for support

---

### 7. FormRecoveryBanner Component

**Purpose:** Persistent banner for form errors with quick fix options

```
┌─────────────────────────────────────────────────────────────┐
│  ⚠️  3 erros encontrados                                   │
│                                                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                   │
│  │ Nome     │  │ Budget   │  │ Schedule │                   │
│  │ required │  │ invalid  │  │ conflict │                   │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘                   │
│       │            │             │                          │
│       └────────────┴─────────────┘                          │
│                    │                                        │
│                    ▼                                        │
│              [Corrigir todos →]                             │
└─────────────────────────────────────────────────────────────┘
```

---

## User Flows

### Flow 1: Form Submission Error

```
[User fills form] → [Submits] → [Error occurs]
                                    │
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
              [Field Error]    [Toast Error]   [Card Error]
                    │               │               │
                    ▼               ▼               ▼
           [Inline highlight]  [Quick retry]  [Recovery options]
                    │               │               │
                    └───────────────┴───────────────┘
                                    │
                                    ▼
                          [User corrects & retries]
                                    │
                                    ▼
                              [Success Toast]
```

### Flow 2: Page Load Error

```
[User navigates to page] → [Page loads] → [Error occurs]
                                           │
                    ┌──────────────────────┼──────────────────────┐
                    ▼                      ▼                      ▼
            [ErrorCard with          [ErrorBoundary        [Partial load with
             retry actions]          with reload]          warning banner]
                    │                      │                      │
                    ▼                      ▼                      ▼
            [User clicks           [User clicks          [User continues with
             "Tentar"]             "Recarregar"]          available content]
```

---

## Implementation Notes

### Priority Order:
1. **ErrorCard** - High impact, replaces generic alerts
2. **InlineFieldError** - Improves form UX significantly
3. **ErrorToast** - Non-blocking, easy to implement
4. **ErrorBoundary** - Catches unexpected errors
5. **RecoveryWizard** - Complex, lower priority
6. **ErrorHistoryPanel** - Nice-to-have, future enhancement
7. **FormRecoveryBanner** - Depends on ErrorCard

### Tech Stack:
- React Error Boundaries
- shadcn/ui components (Alert, Card, Button)
- Toast notifications (existing Toast Patterns)
- Error context provider for global error state

### Connected Docs:
- `docs/Error-Message-Dictionary.md` - Error codes and messages
- `docs/Toast-Patterns.md` - Toast implementation
- `docs/Loading-States.md` - Loading states during retry

---

## Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Error message clarity | 4/10 | 8/10 |
| Recovery action click rate | N/A | >60% |
| Support tickets related to errors | High | -50% |
| Time to recover from error | Unknown | <30s |

---

## Team

- **Design:** Pixelia
- **Implementation:** Pixel Architect (pending)
- **Copy:** Vox (error messages per Error Dictionary)
- **Review:** Quest Master
