# Component: Button

## Variants

### Primary

Primary actions - most important actions on a page.

```css
/* Default */
background: var(--color-brand-primary);
color: white;
box-shadow: var(--shadow-sm);

/* Hover */
background: #5558e3;
box-shadow: var(--shadow-md);

/* Active */
box-shadow: var(--shadow-inner);
transform: translateY(1px);

/* Disabled */
background: var(--color-gray-300);
color: var(--color-gray-500);
cursor: not-allowed;
```

### Secondary

Secondary actions - less prominent actions.

```css
background: var(--color-white);
color: var(--color-gray-700);
border: 1px solid var(--color-gray-300);

/* Hover */
background: var(--color-gray-50);
border-color: var(--color-gray-400);
```

### Ghost

Minimal actions - tertiary options.

```css
background: transparent;
color: var(--color-gray-600);

/* Hover */
background: var(--color-gray-100);
color: var(--color-gray-900);
```

### Destructive

Dangerous actions - delete, terminate, etc.

```css
background: var(--color-error-500);
color: white;

/* Hover */
background: var(--color-error-600);
```

## Sizes

| Size | Height | Padding   | Font      | Border Radius |
| ---- | ------ | --------- | --------- | ------------- |
| `sm` | 32px   | 8px 12px  | text-sm   | radius-md     |
| `md` | 40px   | 8px 16px  | text-sm   | radius-md     |
| `lg` | 48px   | 12px 24px | text-base | radius-md     |

## States

### Loading State

```css
.button-loading {
  position: relative;
  color: transparent;
  pointer-events: none;
}

.button-loading::after {
  content: '';
  position: absolute;
  width: 16px;
  height: 16px;
  top: 50%;
  left: 50%;
  margin: -8px 0 0 -8px;
  border: 2px solid currentColor;
  border-right-color: transparent;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}
```

### Disabled State

```css
.button:disabled {
  background: var(--color-gray-200);
  color: var(--color-gray-400);
  cursor: not-allowed;
  box-shadow: none;
}
```

## With Icons

### Icon Only

```css
.button-icon {
  width: 40px;
  height: 40px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
```

### Icon + Text

```css
.button-with-icon {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
}
```

## Usage Examples

```jsx
// Primary button
<Button variant="primary" size="md">
  Top Up Budget
</Button>

// Secondary button
<Button variant="secondary" size="md">
  Cancel
</Button>

// Destructive button
<Button variant="destructive" size="md">
  Terminate Agent
</Button>

// Icon button
<Button variant="ghost" size="icon">
  <SettingsIcon />
</Button>

// Loading button
<Button variant="primary" loading>
  Saving...
</Button>
```

## Accessibility

- Minimum touch target: 44x44px
- Always provide text labels (or aria-label for icon buttons)
- Use `aria-disabled` instead of `disabled` when showing loading state
- Ensure visible focus states

## Do's and Don'ts

### Do

- Use Primary for the single most important action
- Use consistent button hierarchy across pages
- Provide loading states for async actions
- Use descriptive button text

### Don't

- Don't use multiple Primary buttons in the same area
- Don't use destructive buttons for reversible actions
- Don't use vague labels like "Click here" or "Submit"
