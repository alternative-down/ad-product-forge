# User Control & Freedom Wireframes
## Nielsen's Heuristic #3 — Quick Win #5

**Status:** Draft  
**Author:** Pixelia  
**Date:** 2026-03-27  
**Issue Reference:** #241 (Heuristic UX Review)  
**Target Score:** 4/10 → 8/10

---

## 🎯 Heuristic Definition

> "Users often choose system functions by mistake and will need a clearly marked 'emergency exit' to leave the unwanted state without extended dialogue. Support undo and redo."

---

## 📊 Current State Analysis

**Agents Page (forge-admin):**
- ContractTopUpCard: No undo after top-up confirmation
- ContractBudgetAdjustCard: No undo after budget adjustment
- Hiring Wizard: No draft recovery on browser close
- Forms: No clear cancel/exit paths in several flows

**Quick Win Opportunities:**
1. **Destructive Action Confirmation** — Before irreversible actions
2. **Undo/Redo Actions** — For edit operations
3. **Clear Exit Paths** — Always-visible cancel options
4. **Draft Recovery** — Auto-saved drafts with recovery banner
5. **Wizard Back Navigation** — Non-linear wizard flow

---

## 🏗️ Component Wireframes

### 1. ConfirmationDialog Component

**Purpose:** Require explicit user confirmation before destructive or irreversible actions.

**Wireframe — Destructive Action Confirmation:**
```
┌─────────────────────────────────────────────────────────────┐
│  ⚠️  Confirm Action                                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  You are about to perform this action:                     │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 💸 Top up budget with $50.00                         │   │
│  │    Agent: Pixel Architect                            │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ☐ I understand this action cannot be undone               │
│                                                             │
│  ┌──────────────────┐  ┌────────────────────────────────┐  │
│  │      Cancel      │  │       Confirm Top Up           │  │
│  │   (secondary)    │  │       (destructive)             │  │
│  └──────────────────┘  └────────────────────────────────┘  │
│                                                             │
└─────────────────────────────────────────────────────────────┘

Design Notes:
- Checkbox must be checked before Confirm button enables
- Confirm button has red/destructive styling
- Cancel is always secondary (gray outline)
- Focus trapped inside dialog until resolved
- ESC key triggers cancel action
```

**Props:**
```typescript
interface ConfirmationDialogProps {
  open: boolean;
  title: string;
  description: string;
  actionLabel: string;
  actionType: 'destructive' | 'warning' | 'info';
  requireCheckbox?: boolean;
  checkboxLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}
```

**States:**
| State | Visual |
|-------|--------|
| Default | Checkbox unchecked, Confirm disabled |
| Checked | Confirm enabled, primary styling |
| Loading | Confirm shows spinner, buttons disabled |
| Error | Error message below dialog |

---

### 2. DraftRecoveryBanner Component

**Purpose:** Show when a draft exists from a previous session and offer to restore it.

**Wireframe — Draft Recovery Banner:**
```
┌─────────────────────────────────────────────────────────────┐
│  📝 You have an unsaved draft from your last session       │
│                                                             │
│  Agent: "New Marketing Agent" — Step 2 of 5                │
│                                                             │
│  ┌────────────┐  ┌────────────┐  ┌──────────────────────┐  │
│  │  Discard   │  │   Keep     │  │    Restore Draft     │  │
│  │  (ghost)   │  │  (outline) │  │    (primary)         │  │
│  └────────────┘  └────────────┘  └──────────────────────┘  │
│                                                             │
│  Draft saved 2 hours ago                                    │
└─────────────────────────────────────────────────────────────┘

Design Notes:
- Banner appears at top of page, below header
- "Restore Draft" is primary action (blue filled)
- "Keep" opens both drafts side-by-side for comparison
- Auto-dismiss after 30 seconds if no action taken
- Drafts auto-save every 30 seconds during editing
```

**Props:**
```typescript
interface DraftRecoveryBannerProps {
  draftId: string;
  draftLabel: string;
  draftStep?: number;
  totalSteps?: number;
  savedAt: Date;
  onRestore: () => void;
  onDiscard: () => void;
  onKeepBoth?: () => void; // Optional comparison view
}
```

**States:**
| State | Visual |
|-------|--------|
| Visible | Banner slides down from top |
| Restoring | Spinner on Restore button |
| Discarding | Confirmation inline ("Are you sure?") |
| Dismissed | Banner slides up, stores decision |

---

### 3. WizardBreadcrumb Component

**Purpose:** Show wizard progress with ability to navigate back to any completed step.

**Wireframe — Wizard Breadcrumb Navigation:**
```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  ← Back to Agents                                           │
│                                                             │
│  ┌───────┐   ┌───────┐   ┌───────┐   ┌───────┐   ┌───────┐│
│  │   1   │──▶│   2   │──▶│   3   │──▶│   4   │──▶│   5   ││
│  │  ✓   │   │  ✓   │   │ ●     │   │       │   │       ││
│  └───────┘   └───────┘   └───────┘   └───────┘   └───────┘│
│   Basic      Config     Contract    Review     Confirm    │
│   Info ✓     ✓          ← Current                 ✓       │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Step 3: Contract                                     │  │
│  │  Define budget and schedule                           │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Budget semanal                                       │  │
│  │  ┌────────────────────────────────────────┐          │  │
│  │  │ R$ 500,00                              │          │  │
│  │  └────────────────────────────────────────┘          │  │
│  │  💰 gpt-4o pode consumir R$ 5-20/hora...             │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌──────────┐  ┌───────────────────────────────────────┐  │
│  │  Voltar  │  │            Próximo →                  │  │
│  │ (ghost)  │  │                                       │  │
│  └──────────┘  └───────────────────────────────────────┘  │
│                                                             │
└─────────────────────────────────────────────────────────────┘

Design Notes:
- Completed steps show checkmark and are clickable
- Current step shows filled circle indicator
- Future steps are grayed out and not clickable
- "Back to Agents" always visible as escape route
- Keyboard: Left arrow goes to previous step
```

**Props:**
```typescript
interface WizardBreadcrumbProps {
  steps: WizardStep[];
  currentStepIndex: number;
  onStepClick: (stepIndex: number) => void;
  showStepLabels?: boolean;
}

interface WizardStep {
  id: string;
  label: string;
  completed: boolean;
  isValid?: boolean; // For validation feedback
}
```

---

### 4. UndoRedoToolbar Component

**Purpose:** Provide undo/redo actions for text editing and form modifications.

**Wireframe — Undo/Redo Toolbar:**
```
┌─────────────────────────────────────────────────────────────┐
│  ┌────────┐  ┌────────┐                                    │
│  │  ↶ Undo │  │ Redo ↻│                                    │
│  └────────┘  └────────┘                                    │
│                                                             │
│  Text: "This is my agent prompt..."                        │
│                    ↑                                        │
│                    Cursor here                              │
│                                                             │
│  Tooltip (hover on Undo): "Undo: Remove ' new'"            │
└─────────────────────────────────────────────────────────────┘

Design Notes:
- Toolbar appears in text editing areas only
- Tooltips show description of next undo/redo action
- Disabled state when no actions available
- Keyboard shortcuts: Ctrl/Cmd+Z (undo), Ctrl/Cmd+Shift+Z (redo)
- Undo/Redo stack limited to 50 actions
```

**Props:**
```typescript
interface UndoRedoToolbarProps {
  canUndo: boolean;
  canRedo: boolean;
  undoLabel?: string;
  redoLabel?: string;
  onUndo: () => void;
  onRedo: () => void;
}
```

---

### 5. ExitConfirmationModal Component

**Purpose:** Warn user when navigating away from a page with unsaved changes.

**Wireframe — Exit Confirmation Modal:**
```
┌─────────────────────────────────────────────────────────────┐
│  ⚠️  Unsaved Changes                                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  You have unsaved changes that will be lost if you         │
│  leave this page.                                           │
│                                                             │
│  Changes:                                                   │
│  • Budget modified (R$ 500 → R$ 750)                       │
│  • Schedule changed (Daily → Weekly)                       │
│                                                             │
│  ┌────────────────┐  ┌────────────────────────────────┐     │
│  │   Stay on      │  │         Leave Page            │     │
│  │   Page         │  │         (lose changes)         │     │
│  └────────────────┘  └────────────────────────────────┘     │
│                                                             │
│            [ Save Changes ] (tertiary link)                │
│                                                             │
└─────────────────────────────────────────────────────────────┘

Design Notes:
- Triggered by: navigation click, browser back, tab close
- Shows specific changes made (diff summary)
- "Stay on Page" is default focus (prevents accidental loss)
- "Save Changes" is tertiary action (less prominent)
- Browser beforeunload also triggered as backup
```

**Props:**
```typescript
interface ExitConfirmationModalProps {
  open: boolean;
  changes: ChangeSummary[];
  onStay: () => void;
  onLeave: () => void;
  onSave?: () => void;
}

interface ChangeSummary {
  field: string;
  before: string;
  after: string;
}
```

---

### 6. RollbackButton Component

**Purpose:** Allow users to revert a recent action to its previous state.

**Wireframe — Budget Rollback Button:**
```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  Current Budget: R$ 750,00                                  │
│  Previous: R$ 500,00  (2 hours ago)                        │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  ↩ Rollback to previous budget (R$ 500,00)            │  │
│  │  This action can be undone within 5 minutes           │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  Last top-up: +R$ 250,00 at 10:30 AM                       │
│                                                             │
└─────────────────────────────────────────────────────────────┘

Design Notes:
- Rollback available for 5 minutes after action
- Shows time remaining for rollback window
- "Undo" toast appears after rollback for reversal
- Only available for specific action types (budget, contract)
```

**Props:**
```typescript
interface RollbackButtonProps {
  actionId: string;
  previousValue: string;
  previousLabel: string;
  performedAt: Date;
  rollbackWindowMinutes: number;
  onRollback: () => void;
}
```

---

### 7. CancelActionButton Component

**Purpose:** Always-visible cancel option for forms and modals.

**Wireframe — Form with Cancel Button:**
```
┌─────────────────────────────────────────────────────────────┐
│  Edit Agent Budget                                          │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Agent Name                                           │  │
│  │  ┌────────────────────────────────────────────────┐   │  │
│  │  │ Pixel Architect                                │   │  │
│  │  └────────────────────────────────────────────────┘   │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Weekly Budget (R$)                                  │  │
│  │  ┌────────────────────────────────────────────────┐   │  │
│  │  │ 500.00                                        │   │  │
│  │  └────────────────────────────────────────────────┘   │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌─────────────────────┐  ┌───────────────────────────┐    │
│  │    Cancel           │  │      Save Changes          │    │
│  │    (outline)        │  │      (primary)             │    │
│  └─────────────────────┘  └───────────────────────────┘    │
│                                                             │
└─────────────────────────────────────────────────────────────┘

Design Notes:
- Cancel is always outline/secondary style
- Cancel positioned on left, Save on right
- Keyboard: ESC triggers cancel
- If form has changes, triggers ExitConfirmationModal
```

---

## 📋 Implementation Checklist

| Component | Priority | Status |
|-----------|----------|--------|
| ConfirmationDialog | HIGH | Pending |
| DraftRecoveryBanner | HIGH | Pending |
| WizardBreadcrumb | HIGH | Pending |
| UndoRedoToolbar | MEDIUM | Pending |
| ExitConfirmationModal | HIGH | Pending |
| RollbackButton | MEDIUM | Pending |
| CancelActionButton | HIGH | Pending |

---

## 🔗 Related Documentation

- **Copy:** `docs/Unsaved-Changes-Warning.md` (Vox)
- **Error Recovery:** `docs/ux/Error-Recovery-Wireframes.md`
- **Hiring Wizard Copy:** `docs/Hiring-Wizard-Copy.md`

---

## 👥 Team Assignments

| Role | Assignee |
|------|----------|
| Design | Pixelia |
| Implementation | Pixel Architect (pending) |
| Copy | Vox (already documented in Unsaved-Changes-Warning.md) |
| Review | Quest Master |

---

*Document generated by Pixelia — WireFrame Wizard* ✨
