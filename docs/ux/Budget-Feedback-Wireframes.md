# Agents Page Budget Feedback - Wireframes

## Quick Win #1: Melhorar feedback visual para budget adjustments

**Design Lead:** Pixelia  
**Issue:** #241 Nielsen's 10 Heuristics - Quick Wins  
**Focus:** Nielsen #1 (Visibility of System Status) + Nielsen #5 (Error Prevention)

---

## Problema Atual

### Nielsen #1 - Visibility of System Status (Score: 5/10)

- **Problema:** Stats "Used percent" é apenas texto (e.g., "75.3%") sem representação visual
- **Impacto:** Usuário não consegue estimar rapidamente se está perto do limite

### Nielsen #5 - Error Prevention (Score: 5/10)

- **Problema:** Sem warnings quando orçamento está acabando
- **Impacto:** Admin pode não perceber que agent está prestes a ficar sem budget

---

## Solução: Budget Dashboard Cards

### Card 1: BudgetProgressCard (Substitui stats "Value/Used/Used percent")

```
┌─────────────────────────────────────────────────────────────────┐
│  Weekly Budget                                          $50.00  │
│                                                                 │
│  ████████████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │
│                                                                 │
│  $37.65 used (75.3%)                            $12.35 remaining│
│                                                                 │
│  ⚠️ Running low — 6 days left                        [Top Up]  │
└─────────────────────────────────────────────────────────────────┘
```

**Estados:**

| Estado  | Cor Barra            | Badge       | Mensagem    |
| ------- | -------------------- | ----------- | ----------- |
| < 50%   | bg-green-500         | —           | X days left |
| 50-75%  | bg-yellow-500        | —           | X days left |
| 75-90%  | bg-orange-500        | ⚠️ Warning  | Running low |
| 90-100% | bg-red-500           | 🚨 Critical | Almost out  |
| 100%+   | bg-red-700 + striped | 🚨 Over     | Over budget |

### Card 2: QuickTopUpCard (Melhoria do ContractTopUpCard)

```
┌─────────────────────────────────────────────────────────────────┐
│  💰 Quick Top Up                                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Current: $50.00/week                     After top-up: $75.00  │
│                                                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │   +$10   │  │   +$25   │  │   +$50   │  │  Custom  │       │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘       │
│                                                                 │
│  Amount: [_________] USD                                        │
│                                                                 │
│  ⚠️ Large top-up (>$100) — please confirm                      │
│                                                                 │
│  [  ✓ I understand this will add $50 to my bill  ]              │
│                                                                 │
│                          [ Apply Top Up ]                      │
└─────────────────────────────────────────────────────────────────┘
```

**Funcionalidades:**

- Quick amount buttons: $10, $25, $50, Custom
- Preview do novo valor após top-up
- Checkbox de confirmação para valores > $100 (Nielsen #5 - Error Prevention)

### Card 3: BudgetAdjustCard (Melhoria do ContractBudgetAdjustCard)

```
┌─────────────────────────────────────────────────────────────────┐
│  ⚙️ Adjust Weekly Budget                                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Current: $50.00/week                                           │
│                                                                 │
│  New budget: [_________] USD                                    │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  Preview: +$25.00/week (▲ 50% increase)                 │    │
│  │  New monthly: $300.00                                    │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                 │
│  ⚠️ Decrease not allowed while agent is running                │
│                                                                 │
│  [Schedule reduction for: Tomorrow 09:00]                       │
│                                                                 │
│                          [ Apply New Budget ]                   │
└─────────────────────────────────────────────────────────────────┘
```

**Funcionalidades:**

- Preview visual da mudança (↑↓ + %)
- Cálculo de impacto mensal
- Warning quando decrease não é possível (agent running)
- Opção de agendar redução futura

---

## Componente: BudgetToast

Baseado em `docs/Toast-Patterns.md`:

```tsx
// Warning Toast (persists until dismissed)
<Toast variant="warning">
  <AlertTriangle className="h-5 w-5" />
  <div>
    <p className="font-medium">Budget running low</p>
    <p className="text-sm">Agent "{agentName}" has only $5.00 remaining this week.</p>
  </div>
</Toast>

// Success Toast (auto-dismiss 3s)
<Toast variant="success">
  <CheckCircle className="h-5 w-5" />
  <div>
    <p className="font-medium">Top up successful</p>
    <p className="text-sm">Budget increased to $75.00/week</p>
  </div>
</Toast>
```

---

## Implementação Técnica

### Pasta: `apps/forge-admin/src/features/agents/components/`

```
components/
├── BudgetProgressCard.tsx    # Novo: barra de progresso visual
├── QuickTopUpCard.tsx        # Novo: top-up rápido com presets
├── BudgetAdjustCard.tsx      # Melhoria: preview e warnings
└── BudgetToast.tsx           # Novo: toasts específicos de budget
```

### Hook: `useBudgetStatus`

```tsx
function useBudgetStatus(contract: ActiveContract | null) {
  const percent = contract?.spentPercent ?? 0;

  const status = useMemo(() => {
    if (percent >= 100) return 'over';
    if (percent >= 90) return 'critical';
    if (percent >= 75) return 'warning';
    if (percent >= 50) return 'caution';
    return 'healthy';
  }, [percent]);

  const color = {
    healthy: 'bg-green-500',
    caution: 'bg-green-500',
    warning: 'bg-orange-500',
    critical: 'bg-red-500',
    over: 'bg-red-700',
  }[status];

  const message = {
    healthy: `${daysLeft} days remaining`,
    caution: `${daysLeft} days remaining`,
    warning: 'Running low',
    critical: 'Almost out',
    over: 'Over budget',
  }[status];

  return { status, color, message, percent };
}
```

---

## Wireframe: Contract Tab (Atualizado)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Agent: Luna (Copywriter)                                     [← Back]      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  [Runtime]  [Communications]  [Schedules]  [History]                       │
│  ─────────────────────────────────────────────────────────────────────────   │
│                                                                             │
│  ┌─ Runtime ──────────────┬─ Configuration ─┬─ Contract ─┬─ GitHub ─┐   │
│  │                         │                  │            │          │   │
│  │  ┌─────────────────────────────────────────────────────────────┐       │   │
│  │  │  💰 Weekly Budget                                    $50.00 │       │   │
│  │  │                                                             │       │   │
│  │  │  ████████████████████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │       │   │
│  │  │  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │       │   │
│  │  │                                                             │       │   │
│  │  │  $37.65 used (75.3%)              $12.35 remaining          │       │   │
│  │  │                                                             │       │   │
│  │  │  ⚠️ Running low — 2 days left                    [Top Up]   │       │   │
│  │  └─────────────────────────────────────────────────────────────┘       │   │
│  │                                                                         │   │
│  │  ┌─────────────────────────────────────────────────────────────┐       │   │
│  │  │  💰 Quick Top Up                                             │       │   │
│  │  │  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐           │       │   │
│  │  │  │  +$10  │  │  +$25  │  │  +$50  │  │ Custom │           │       │   │
│  │  │  └────────┘  └────────┘  └────────┘  └────────┘           │       │   │
│  │  │  Amount: [_________] USD                                    │       │   │
│  │  │                                              [Apply Top Up] │       │   │
│  │  └─────────────────────────────────────────────────────────────┘       │   │
│  │                                                                         │   │
│  │  ┌─────────────────────────────────────────────────────────────┐       │   │
│  │  │  ⚙️ Adjust Weekly Budget                                       │       │   │
│  │  │  Current: $50.00/week                                         │       │   │
│  │  │  New budget: [_________] USD                                   │       │   │
│  │  │  ┌──────────────────────────────────────────────────────┐   │       │   │
│  │  │  │ Preview: +$25.00/week (▲ 50% increase)                │   │       │   │
│  │  │  └──────────────────────────────────────────────────────┘   │       │   │
│  │  │  ⚠️ Decrease not allowed while agent is running          │       │   │
│  │  │                                              [Apply Budget]│       │   │
│  │  └─────────────────────────────────────────────────────────────┘       │   │
│  │                                                                         │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Estados a Considerar

### Empty State (Sem contrato)

```
┌─────────────────────────────────────────────────────────────────┐
│  💰 Budget                                                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  No active contract                                            │
│                                                                 │
│  Hire this agent to set up a budget and start operations.       │
│                                                                 │
│                          [ Hire Agent ]                        │
└─────────────────────────────────────────────────────────────────┘
```

### Loading State

```
┌─────────────────────────────────────────────────────────────────┐
│  💰 Budget                                    ████████████░░░  │
│                                              Loading...          │
└─────────────────────────────────────────────────────────────────┘
```

### Error State

```
┌─────────────────────────────────────────────────────────────────┐
│  💰 Budget                                    ⚠️ Failed to load │
│                                                                 │
│  Could not load contract information.                            │
│  [ Try Again ]                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Checklist de UX

- [ ] Nielsen #1: Barra de progresso visual com cores semânticas
- [ ] Nielsen #1: Status badges (Warning, Critical, Over)
- [ ] Nielsen #5: Checkbox de confirmação para top-ups > $100
- [ ] Nielsen #5: Warning quando decrease não é possível
- [ ] Nielsen #9: Toast de sucesso após operações
- [ ] Nielsen #9: Toast de erro com mensagem amigável
- [ ] Empty state quando não há contrato
- [ ] Loading state com skeleton
- [ ] Error state com retry

---

## Related Docs

- `docs/Toast-Patterns.md` — Toast variants
- `docs/Error-Message-Dictionary.md` — Error codes
- `docs/BRAND-VOICE.md` — Tone guidelines

---

## Estimativas

- **Design:** 4 horas (wireframes + specs)
- **Implementation:** 2 dias (Pixel Architect)
- **Testing:** 4 horas

---

_Wireframes by Pixelia — WireFrame Wizard for Alternative Down_
_Generated: 2026-03-27_
