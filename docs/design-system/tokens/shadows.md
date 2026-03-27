# Design Tokens: Shadows

## Shadow Scale

### Subtle Shadows
```css
/* xs - Minimal elevation */
--shadow-xs: 0 1px 2px 0 rgb(0 0 0 / 0.05);

/* sm - Light cards */
--shadow-sm: 0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1);
```

### Standard Shadows
```css
/* md - Default card shadow */
--shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);

/* lg - Elevated cards */
--shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);
```

### Strong Shadows
```css
/* xl - Modals, dropdowns */
--shadow-xl: 0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1);

/* 2xl - Popovers, tooltips */
--shadow-2xl: 0 25px 50px -12px rgb(0 0 0 / 0.25);
```

### Inner Shadows
```css
/* Inner shadow for inputs */
--shadow-inner: inset 0 2px 4px 0 rgb(0 0 0 / 0.05);

/* Inner shadow strong */
--shadow-inner-lg: inset 0 4px 6px -1px rgb(0 0 0 / 0.1);
```

## Shadow Usage Guidelines

| Token | Usage |
|-------|-------|
| `--shadow-xs` | Tooltips, subtle borders |
| `--shadow-sm` | Small cards, tags |
| `--shadow-md` | Default cards, tables |
| `--shadow-lg` | Modals, dropdowns |
| `--shadow-xl` | Popovers, floating UI |
| `--shadow-2xl` | Full-screen overlays |
| `--shadow-inner` | Pressed states, inputs |

## Component Shadow Examples

### Card
```css
.card {
  box-shadow: var(--shadow-sm);
  border-radius: var(--radius-lg);
}

.card:hover {
  box-shadow: var(--shadow-md);
}
```

### Button
```css
.button {
  box-shadow: var(--shadow-sm);
}

.button:hover {
  box-shadow: var(--shadow-md);
}

.button:active {
  box-shadow: var(--shadow-inner);
}
```

### Input
```css
.input {
  box-shadow: var(--shadow-inner);
}

.input:focus {
  box-shadow: var(--shadow-inner), 0 0 0 2px var(--color-brand-primary);
}
```

### Modal
```css
.modal-overlay {
  box-shadow: var(--shadow-2xl);
}

.modal-content {
  box-shadow: var(--shadow-xl);
  border-radius: var(--radius-xl);
}
```

### Dropdown
```css
.dropdown {
  box-shadow: var(--shadow-lg);
  border-radius: var(--radius-md);
}
```

### Toast
```css
.toast {
  box-shadow: var(--shadow-lg);
  border-radius: var(--radius-md);
}
```

## Elevation Levels

| Level | Shadow | Usage |
|-------|--------|-------|
| 0 | none | Flat elements |
| 1 | `--shadow-xs` | Tags, badges |
| 2 | `--shadow-sm` | Cards, list items |
| 3 | `--shadow-md` | Active cards |
| 4 | `--shadow-lg` | Dropdowns |
| 5 | `--shadow-xl` | Modals, popovers |
| 6 | `--shadow-2xl` | Full overlays |

## Focus Ring

```css
/* Focus visible */
.focus-ring {
  outline: none;
  box-shadow: var(--shadow-sm), 0 0 0 2px var(--color-brand-primary);
}

/* Focus within (for groups) */
.focus-within:focus-within {
  box-shadow: var(--shadow-sm), 0 0 0 2px var(--color-brand-primary);
}
```

## Dark Mode Considerations

```css
/* Light mode */
--shadow-color: rgb(0 0 0);

/* Dark mode */
@media (prefers-color-scheme: dark) {
  --shadow-color: rgb(0 0 0 / 0.3);
}
```

## Motion with Shadows

```css
/* Elevate on hover */
.elevate-on-hover {
  transition: box-shadow 200ms ease-out;
}

.elevate-on-hover:hover {
  box-shadow: var(--shadow-lg);
}

/* Depress on active */
.depress-on-active:active {
  box-shadow: var(--shadow-inner);
  transform: translateY(1px);
}
```

## Accessibility

- Ensure focus states are visible against all backgrounds
- Maintain shadow consistency across similar components
- Don't rely solely on shadows to indicate elevation - use other cues too
