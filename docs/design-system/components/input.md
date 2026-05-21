# Component: Input

## Anatomy

An input field consists of:

- Label (required)
- Input element
- Helper text (optional)
- Error message (conditional)

## Basic Input

```css
.input {
  display: block;
  width: 100%;
  height: 40px;
  padding: var(--space-2) var(--space-3);
  font-size: var(--text-sm);
  line-height: 1.5;
  color: var(--color-gray-900);
  background: var(--color-white);
  border: 1px solid var(--color-gray-300);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-inner);
  transition:
    border-color 150ms,
    box-shadow 150ms;
}

/* Focus */
.input:focus {
  outline: none;
  border-color: var(--color-brand-primary);
  box-shadow:
    var(--shadow-inner),
    0 0 0 2px var(--color-brand-primary-alpha);
}

/* Disabled */
.input:disabled {
  background: var(--color-gray-100);
  color: var(--color-gray-400);
  cursor: not-allowed;
}
```

## States

### Default

```css
border-color: var(--color-gray-300);
background: var(--color-white);
```

### Hover

```css
border-color: var(--color-gray-400);
```

### Focus

```css
border-color: var(--color-brand-primary);
box-shadow:
  var(--shadow-inner),
  0 0 0 2px rgba(99, 102, 241, 0.2);
```

### Error

```css
border-color: var(--color-error-500);
background: var(--color-error-50);
```

### Success

```css
border-color: var(--color-success-500);
```

### Disabled

```css
background: var(--color-gray-100);
color: var(--color-gray-400);
cursor: not-allowed;
```

## Input Sizes

| Size | Height | Padding   | Font      |
| ---- | ------ | --------- | --------- |
| `sm` | 32px   | 6px 10px  | text-xs   |
| `md` | 40px   | 8px 12px  | text-sm   |
| `lg` | 48px   | 12px 16px | text-base |

## Input Variants

### Text Input

```jsx
<div className="input-wrapper">
  <Label htmlFor="name">Name</Label>
  <Input id="name" type="text" placeholder="Enter agent name" />
  <HelperText>Your agent's display name</HelperText>
</div>
```

### Number Input

```jsx
<Input type="number" min="0.01" step="0.01" placeholder="0.00" />
```

### Password Input

```jsx
<Input type="password" placeholder="Enter password" />
```

### With Prefix/Suffix

```css
.input-with-prefix,
.input-with-suffix {
  display: flex;
  align-items: center;
}

.input-with-prefix .input {
  border-top-left-radius: 0;
  border-bottom-left-radius: 0;
}

.input-prefix {
  padding: var(--space-2) var(--space-3);
  background: var(--color-gray-100);
  border: 1px solid var(--color-gray-300);
  border-right: none;
  border-radius: var(--radius-md);
  border-top-right-radius: 0;
  border-bottom-right-radius: 0;
  color: var(--color-gray-500);
}
```

## Error States

### Error with Message

```jsx
<div className="input-wrapper">
  <Label htmlFor="budget">Budget</Label>
  <Input id="budget" state="error" aria-invalid="true" aria-describedby="budget-error" />
  <ErrorMessage id="budget-error">Budget é obrigatório</ErrorMessage>
</div>
```

### Validation Rules Display

```jsx
<Input
  state={isValid ? 'success' : 'default'}
/>
<HelperText>
  Min: R$ 1,00 | Max: R$ 50.000,00
</HelperText>
```

## Helper Text & Labels

### Label

```css
.label {
  display: block;
  font-size: var(--text-sm);
  font-weight: var(--font-semibold);
  color: var(--color-gray-700);
  margin-bottom: var(--space-1);
}
```

### Helper Text

```css
.helper-text {
  font-size: var(--text-xs);
  color: var(--color-gray-500);
  margin-top: var(--space-1);
}
```

### Error Message

```css
.error-message {
  font-size: var(--text-xs);
  color: var(--color-error-600);
  margin-top: var(--space-1);
  display: flex;
  align-items: center;
  gap: var(--space-1);
}
```

## Accessibility

- Always associate `<label>` with input via `htmlFor`
- Use `aria-describedby` for helper/error text
- Use `aria-invalid="true"` for error states
- Use `aria-required="true"` for required fields
- Ensure visible focus states

## Usage Example

```jsx
<div className="space-y-4">
  {/* Default */}
  <InputWrapper>
    <Label htmlFor="agentName">Nome do Agent</Label>
    <Input id="agentName" placeholder="Ex: Coding Assistant" />
    <HelperText>Nome que aparece na listagem</HelperText>
  </InputWrapper>

  {/* With error */}
  <InputWrapper>
    <Label htmlFor="budget">Budget semanal</Label>
    <Input id="budget" state="error" aria-invalid="true" aria-describedby="budget-error" />
    <ErrorMessage id="budget-error">Budget é obrigatório</ErrorMessage>
  </InputWrapper>
</div>
```
