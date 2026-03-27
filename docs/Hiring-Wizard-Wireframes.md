# Hiring Wizard Wireframes — forge-admin (Issue #242)

> Wireframes e component specs para o wizard de contratação de agents.
> Copy source: `docs/Hiring-Wizard-Copy.md` (Vox - UX Approved)
> Design system: shadcn/ui + Tailwind CSS

---

## 1. Wizard Layout

### Container Structure

```
┌─────────────────────────────────────────────────────────────┐
│  [Logo]  forge-admin                         [User Menu]   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                   HIRING WIZARD                        │  │
│  │                                                       │  │
│  │  ┌─────┐    ┌─────┐    ┌─────┐    ┌─────┐    ┌─────┐  │  │
│  │  │  1  │───▶│  2  │───▶│  3  │───▶│  4  │───▶│  5  │  │  │
│  │  └─────┘    └─────┘    └─────┘    └─────┘    └─────┘  │  │
│  │ Basic     Config    Contract   Review    Confirm       │  │
│  │  Info                                                       │  │
│  │                                                       │  │
│  │  ┌─────────────────────────────────────────────────┐   │  │
│  │  │                                                 │   │  │
│  │  │              STEP CONTENT AREA                  │   │  │
│  │  │                                                 │   │  │
│  │  │                                                 │   │  │
│  │  │                                                 │   │  │
│  │  └─────────────────────────────────────────────────┘   │  │
│  │                                                       │  │
│  │            [Voltar]              [Próximo]            │  │
│  │                                                       │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Component: WizardContainer

| Prop | Type | Description |
|------|------|-------------|
| `currentStep` | `1-5` | Current step number |
| `onStepChange` | `function` | Callback when step changes |
| `onComplete` | `function` | Callback when wizard completes |
| `onCancel` | `function` | Callback when cancelled |

### Component: StepIndicator

| Prop | Type | Description |
|------|------|-------------|
| `steps` | `Step[]` | Array of step definitions |
| `currentStep` | `number` | Active step |
| `completedSteps` | `number[]` | Steps already completed |

---

## 2. Step 1: Basic Info (Informações Básicas)

### Copy (✅ UX Approved)

| Element | Copy |
|---------|------|
| **Step title** | Basic Info |
| **Step description** | Configure as informações básicas do agent. |
| **Progress indicator** | Step 1 de 5 |

### Wireframe

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  Basic Info                                    Step 1 de 5  │
│  ─────────────────────────────────────────────────────────  │
│  Configure as informações básicas do agent.                  │
│                                                             │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  Agent name *                                         │ │
│  │  ┌───────────────────────────────────────────────────┐ │ │
│  │  │ ex: vox-brand-voice                              │ │ │
│  │  └───────────────────────────────────────────────────┘ │ │
│  │  Nome único no sistema. 3-50 caracteres.               │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                             │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  Function *                         [ℹ️ tooltip]        │ │
│  │  ┌───────────────────────────────────────────────────┐ │ │
│  │  │ Selecione uma função                         ▼   │ │ │
│  │  └───────────────────────────────────────────────────┘ │ │
│  │  Define permissões e ferramentas disponíveis.         │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                             │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  Description                                           │ │
│  │  ┌───────────────────────────────────────────────────┐ │ │
│  │  │                                                   │ │ │
│  │  │ Descreva o propósito deste agent...               │ │ │
│  │  │                                                   │ │ │
│  │  │                                                   │ │ │
│  │  └───────────────────────────────────────────────────┘ │ │
│  │  Opcional, máximo 500 caracteres                      │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                             │
│            [Cancelar]                    [Próximo ▶]        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Function Options (✅ UX Approved)

| Option | Label | Description |
|--------|-------|-------------|
| `copywriter` | Copywriter | Gera textos de marketing |
| `researcher` | Researcher | Pesquisa e análise de dados |
| `developer` | Developer | Escreve e revisa código |
| `support` | Support | Atende e resolve dúvidas |
| `analyst` | Analyst | Analisa métricas e relatórios |
| `general` | General | Propósito flexível |

### Validation Messages (✅ UX Approved)

| Validation | Message |
|------------|---------|
| Required | Nome do agent é obrigatório |
| Min chars | Nome precisa ter pelo menos 3 caracteres |
| Max chars | Nome pode ter no máximo 50 caracteres |
| Invalid chars | Use apenas letras, números e hífens |
| Already exists | Este nome já está em uso |

### Component: FormField

| Prop | Type | Description |
|------|------|-------------|
| `name` | `string` | Field identifier |
| `label` | `string` | Label text |
| `placeholder` | `string` | Placeholder text |
| `helpText` | `string` | Helper text below field |
| `required` | `boolean` | Is required |
| `error` | `string` | Error message |
| `type` | `'text' \| 'select' \| 'textarea'` | Input type |

---

## 3. Step 2: Configuration (Configuração)

### Copy (✅ UX Approved)

| Element | Copy |
|---------|------|
| **Step title** | Configuration |
| **Step description** | Configure o modelo de IA e instruções do agent. |
| **Progress indicator** | Step 2 de 5 |

### Wireframe

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  Configuration                                  Step 2 de 5 │
│  ─────────────────────────────────────────────────────────  │
│  Configure o modelo de IA e instruções do agent.            │
│                                                             │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  Modelo *                              [ℹ️ tooltip]      │ │
│  │  ┌───────────────────────────────────────────────────┐ │ │
│  │  │ Selecione o modelo                           ▼   │ │ │
│  │  └───────────────────────────────────────────────────┘ │ │
│  │  gpt-4o, gpt-4o-mini, claude-3-5...                    │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                             │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  Model Comparison                                      │ │
│  │  ┌──────────┬─────────────┬────────────────────────┐  │ │
│  │  │ GPT-4o   │ 💰💰💰       │ Mais capaz, mais caro  │  │ │
│  │  ├──────────┼─────────────┼────────────────────────┤  │ │
│  │  │ GPT-4o   │ 💰💰         │ Bom custo-benefício   │  │ │
│  │  │ Mini     │             │                        │  │ │
│  │  ├──────────┼─────────────┼────────────────────────┤  │ │
│  │  │ Claude   │ 💰💰         │ Excelente raciocínio   │  │ │
│  │  │ 3.5      │             │                        │  │ │
│  │  └──────────┴─────────────┴────────────────────────┘  │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                             │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  Instructions *                      [ℹ️ tooltip]       │ │
│  │  ┌───────────────────────────────────────────────────┐ │ │
│  │  │                                                   │ │ │
│  │  │ Descreva o que este agent deve fazer...          │ │ │
│  │  │                                                   │ │ │
│  │  │                                                   │ │ │
│  │  │                                                   │ │ │
│  │  └───────────────────────────────────────────────────┘ │ │
│  │  Seja específico sobre responsabilidades e            │ │
│  │  comportamento.                                        │ │
│  │  Mínimo 50 caracteres (125/5000)                      │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                             │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  Workspace                            [ℹ️ tooltip]     │ │
│  │  ┌───────────────────────────────────────────────────┐ │ │
│  │  │ Selecione um workspace                        ▼  │ │ │
│  │  └───────────────────────────────────────────────────┘ │ │
│  │  Diretório de trabalho para arquivos e memória.        │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                             │
│            [Voltar ◀]                     [Próximo ▶]       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Model Options (✅ UX Approved)

| Option | Label | Description | Cost Indicator |
|--------|-------|-------------|----------------|
| `gpt-4o` | GPT-4o | Mais capaz, mais caro | 💰💰💰 |
| `gpt-4o-mini` | GPT-4o Mini | Bom custo-benefício | 💰💰 |
| `gpt-4-turbo` | GPT-4 Turbo | Rápido e capaz | 💰💰 |
| `claude-3-5-sonnet` | Claude 3.5 Sonnet | Excelente raciocínio | 💰💰 |
| `claude-3-5-haiku` | Claude 3.5 Haiku | Rápido, econômico | 💰 |

### Tooltips (✅ UX Approved)

| Field | Tooltip |
|-------|---------|
| model | Modelo de IA usado para gerar respostas. |
| instructions | Instruções detalhadas que guiam o comportamento do agent. |
| workspace | Espaço de armazenamento para arquivos e memória persistente. |

### Validation Messages (✅ UX Approved)

| Validation | Message |
|------------|---------|
| Required (model) | Selecione um modelo |
| Required (instructions) | Instructions são obrigatórias |
| Min chars | Mínimo 50 caracteres necessários |
| Max chars | Máximo 5000 caracteres |

---

## 4. Step 3: Contract (Contrato)

### Copy (✅ UX Approved)

| Element | Copy |
|---------|------|
| **Step title** | Contract |
| **Step description** | Defina o orçamento e cronograma do agent. |
| **Progress indicator** | Step 3 de 5 |

### Wireframe

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  Contract                                       Step 3 de 5 │
│  ─────────────────────────────────────────────────────────  │
│  Defina o orçamento e cronograma do agent.                  │
│                                                             │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  Budget Type                                           │ │
│  │                                                         │ │
│  │  ○ Semana    ● Mês    ○ Ano                           │ │
│  │                                                         │ │
│  │  ┌───────────────────────────────────────────────────┐ │ │
│  │  │  Budget Amount *                                 │ │ │
│  │  │  $ [              ] por semana                    │ │ │
│  │  └───────────────────────────────────────────────────┘ │ │
│  │                                                         │ │
│  │  💡 Valor mínimo recomendado: $5.00/semana            │ │
│  │                                                         │ │
│  │  ┌───────────────────────────────────────────────────┐ │ │
│  │  │  Estimated Usage                                  │ │ │
│  │  │  ━━━━━━━━━━━━━━━━━━━░░░░░░ 65% utilizado           │ │ │
│  │  │  $16.25 de $25.00                                  │ │ │
│  │  │                                                    │ │ │
│  │  │  Modelo: GPT-4o Mini                              │ │ │
│  │  │  Histórico: ~$3.25/dia                            │ │ │
│  │  └───────────────────────────────────────────────────┘ │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                             │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  Schedule                                              │ │
│  │                                                         │ │
│  │  ● Sempre ativo                                        │ │
│  │  ○ Agendar                                             │ │
│  │                                                         │ │
│  │  ┌──────────────────┐ ┌──────────────────────────────┐ │ │
│  │  │  Start Time      │ │  End Time                    │ │ │
│  │  │  [09:00        ▼] │ │  [18:00                   ▼]  │ │ │
│  │  └──────────────────┘ └──────────────────────────────┘ │ │
│  │                                                         │ │
│  │  ☐ Seg   ☑ Ter   ☑ Qua   ☑ Qui   ☑ Sex   ☐ Sáb   ☐ Dom│ │
│  │                                                         │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                             │
│            [Voltar ◀]                     [Próximo ▶]        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Budget Options (Placeholder - Vox will fill)

| Budget Type | Description |
|-------------|-------------|
| Weekly | Cobrado por semana |
| Monthly | Cobrado por mês |
| Yearly | Cobrado por ano |

### Validation Messages (Placeholder)

| Validation | Message |
|------------|---------|
| Required | Valor é obrigatório |
| Min amount | Valor mínimo: ${{min}} |
| Invalid | Use apenas números |

---

## 5. Step 4: Review (Revisão)

### Copy (✅ UX Approved)

| Element | Copy |
|---------|------|
| **Step title** | Review |
| **Step description** | Revise as informações antes de confirmar. |
| **Progress indicator** | Step 4 de 5 |

### Wireframe

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  Review                                         Step 4 de 5 │
│  ─────────────────────────────────────────────────────────  │
│  Revise as informações antes de confirmar.                 │
│                                                             │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  ▶ Basic Info                                    [Edit] │ │
│  │  ──────────────────────────────────────────────────────  │ │
│  │  Agent name:    vox-brand-voice                        │ │
│  │  Function:      Copywriter                             │ │
│  │  Description:   Gera textos de marketing para...       │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                             │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  ▶ Configuration                                  [Edit] │ │
│  │  ──────────────────────────────────────────────────────  │ │
│  │  Modelo:         GPT-4o Mini                           │ │
│  │  Instructions:   Você é um copywriter especializado... │ │
│  │  Workspace:      vox-workspace                         │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                             │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  ▶ Contract                                        [Edit] │ │
│  │  ──────────────────────────────────────────────────────  │ │
│  │  Budget:         $25.00/semana                         │ │
│  │  Schedule:       Ter-Sex, 09:00-18:00                  │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                             │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  💰 Resumo do Contrato                                  │ │
│  │  ──────────────────────────────────────────────────────  │ │
│  │  Custo estimado mensal:   $100.00                      │ │
│  │  Status:                 ⏳ Aguardando confirmação      │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                             │
│            [Voltar ◀]                     [Confirmar ▶]      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Component: ReviewCard

| Prop | Type | Description |
|------|------|-------------|
| `title` | `string` | Card title |
| `onEdit` | `function` | Edit callback |
| `isExpanded` | `boolean` | Expanded state |
| `children` | `ReactNode` | Content |

---

## 6. Step 5: Confirm (Confirmação)

### Wireframe - Success State

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │                                                     │    │
│  │                     ✅                              │    │
│  │                                                     │    │
│  │              Agent Contratado!                      │    │
│  │                                                     │    │
│  │     vox-brand-voice está inicializando...          │    │
│  │                                                     │    │
│  │     ┌──────────────────┐                           │    │
│  │     │  Ver Runtime     │                           │    │
│  │     └──────────────────┘                           │    │
│  │                                                     │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Wireframe - Loading State

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │                                                     │    │
│  │                     ⏳                              │    │
│  │                                                     │    │
│  │              Contratando agent...                  │    │
│  │                                                     │    │
│  │     Por favor, aguarde enquanto preparamos tudo.   │    │
│  │                                                     │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Wireframe - Error State

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │                                                     │    │
│  │                     ❌                              │    │
│  │                                                     │    │
│  │              Falha ao Contratar                     │    │
│  │                                                     │    │
│  │     Não foi possível inicializar o agent.          │    │
│  │     Verifique o budget e tente novamente.          │    │
│  │                                                     │    │
│  │     ┌──────────────────┐  ┌──────────────────┐    │    │
│  │     │  Tentar Novamente │  │  Voltar          │    │    │
│  │     └──────────────────┘  └──────────────────┘    │    │
│  │                                                     │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 7. Global Components

### Toast Notifications (✅ UX Approved - Toast-Patterns.md)

| Type | Duration | Example |
|------|----------|---------|
| Success | 3s auto-dismiss | "Agent contratado" + "Vox está inicializando..." |
| Error | Persists | "Falha ao contratar" + "Verifique o budget e tente novamente" |
| Warning | Persists | "Budget baixo" + "15% restantes..." |

### Unsaved Changes Warning (Placeholder - Vox creating)

```
┌─────────────────────────────────────────────────────────────┐
│  ⚠️  Você tem alterações não salvas                          │
│                                                             │
│  Tem certeza que deseja sair? Suas alterações serão        │
│  perdidas.                                                   │
│                                                             │
│     [Descartar alterações]      [Continuar editando]        │
└─────────────────────────────────────────────────────────────┘
```

### Empty States (Placeholder - Vox creating)

| Context | Message |
|---------|---------|
| No agents | "Nenhum agent encontrado. Clique em 'Contratar Agent' para começar." |
| No workspaces | "Nenhum workspace disponível. Crie um workspace primeiro." |
| No schedules | "Nenhum agendamento. Configure uma rotina para este agent." |

### Loading States (Placeholder - Vox creating)

| Context | Message |
|---------|---------|
| Saving | "Salvando..." |
| Loading | "Carregando..." |
| Processing | "Processando..." |

---

## 8. Component Inventory

### Wizard Components

| Component | File | Props | Status |
|-----------|------|-------|--------|
| `WizardContainer` | `components/hiring-wizard/WizardContainer.tsx` | `currentStep`, `onStepChange`, `onComplete`, `onCancel` | Ready to build |
| `StepIndicator` | `components/hiring-wizard/StepIndicator.tsx` | `steps`, `currentStep`, `completedSteps` | Ready to build |
| `StepContent` | `components/hiring-wizard/StepContent.tsx` | `step`, `children` | Ready to build |
| `WizardNavigation` | `components/hiring-wizard/WizardNavigation.tsx` | `onBack`, `onNext`, `onCancel`, `isFirstStep`, `isLastStep` | Ready to build |

### Form Components (shadcn/ui base)

| Component | Source | Customization |
|-----------|--------|---------------|
| `Input` | shadcn/ui | Brand colors, error states |
| `Textarea` | shadcn/ui | Character counter |
| `Select` | shadcn/ui | Custom options rendering |
| `Button` | shadcn/ui | Loading state |
| `FormField` | Custom wrapper | Error messages, help text |

### Feedback Components

| Component | Source | Status |
|-----------|--------|--------|
| `Toast` | shadcn/ui | Ready - patterns documented |
| `Tooltip` | shadcn/ui | Ready - terms documented |
| `AlertDialog` | shadcn/ui | For unsaved changes |
| `Card` | shadcn/ui | For review step |
| `Accordion` | shadcn/ui | For collapsible sections |

---

## 9. Implementation Notes

### Tech Stack (per Issue #242 spec)
- Next.js 15
- shadcn/ui components
- Zustand or Context for wizard state
- Zod for validation
- React Hook Form

### State Management

```typescript
interface WizardState {
  currentStep: 1 | 2 | 3 | 4 | 5;
  basicInfo: BasicInfoDraft;
  configuration: ConfigDraft;
  contract: ContractDraft;
  isSubmitting: boolean;
  error: string | null;
}
```

### Validation Strategy
- Step-level validation before allowing "Next"
- Real-time inline validation on blur
- Error messages from `Hiring-Wizard-Copy.md`

### Accessibility (WCAG 2.1 AA)
- Focus management between steps
- ARIA labels for step indicator
- Error announcements for screen readers
- Keyboard navigation (Enter, Tab, Escape)

---

## 10. Related Documents

| Document | Path | Status |
|----------|------|--------|
| UX Review | `/workspace/forge-admin-ux-review.md` | ✅ Complete |
| Toast Patterns | `docs/Toast-Patterns.md` | ✅ UX Approved |
| Error Dictionary | `docs/Error-Message-Dictionary.md` | ✅ UX Approved |
| Hiring Wizard Copy | `docs/Hiring-Wizard-Copy.md` | ✅ UX Approved |
| Brand Voice | `docs/BRAND-VOICE.md` | ✅ Complete |
| Unsaved Changes | `docs/Unsaved-Changes-Warning.md` | ⏳ Pending Vox |
| Empty States | `docs/Empty-States.md` | ⏳ Pending Vox |
| Loading States | `docs/Loading-States.md` | ⏳ Pending Vox |

---

*Wireframes created by Pixelia - Design Lead*
*Copy validated by Vox - Brand Voice*
*Issue: #242 - Hiring Workflow UX*
