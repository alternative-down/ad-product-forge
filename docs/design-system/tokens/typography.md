# Design Tokens: Typography

## Font Families

| Token | Value | Usage |
|-------|-------|-------|
| `--font-sans` | `Inter, system-ui, -apple-system, sans-serif` | Primary font for UI |
| `--font-mono` | `JetBrains Mono, Consolas, monospace` | Code, technical data |

## Font Sizes

| Token | Size | Line Height | Usage |
|-------|------|-------------|-------|
| `--text-xs` | `0.75rem` (12px) | `1rem` (16px) | Labels, captions |
| `--text-sm` | `0.875rem` (14px) | `1.25rem` (20px) | Secondary text |
| `--text-base` | `1rem` (16px) | `1.5rem` (24px) | Body text |
| `--text-lg` | `1.125rem` (18px) | `1.75rem` (28px) | Lead text |
| `--text-xl` | `1.25rem` (20px) | `1.75rem` (28px) | Card titles |
| `--text-2xl` | `1.5rem` (24px) | `2rem` (32px) | Section headers |
| `--text-3xl` | `1.875rem` (30px) | `2.25rem` (36px) | Page titles |
| `--text-4xl` | `2.25rem` (36px) | `2.5rem` (40px) | Hero headers |

## Font Weights

| Token | Value | Usage |
|-------|-------|-------|
| `--font-normal` | `400` | Body text |
| `--font-medium` | `500` | Secondary emphasis |
| `--font-semibold` | `600` | Primary emphasis, labels |
| `--font-bold` | `700` | Headings, strong emphasis |

## Line Heights

| Token | Value | Usage |
|-------|-------|-------|
| `--leading-none` | `1` | Tight spacing |
| `--leading-tight` | `1.25` | Headings |
| `--leading-snug` | `1.375` | Subheadings |
| `--leading-normal` | `1.5` | Body text |
| `--leading-relaxed` | `1.625` | Long-form content |

## Letter Spacing

| Token | Value | Usage |
|-------|-------|-------|
| `--tracking-tighter` | `-0.05em` | Large headings |
| `--tracking-tight` | `-0.025em` | Medium headings |
| `--tracking-normal` | `0` | Body text |
| `--tracking-wide` | `0.025em` | Labels, caps |

## Text Styles

### Display
```css
font-family: var(--font-sans);
font-size: var(--text-4xl);
font-weight: var(--font-bold);
line-height: var(--leading-none);
letter-spacing: var(--tracking-tighter);
```

### H1 - Page Title
```css
font-family: var(--font-sans);
font-size: var(--text-3xl);
font-weight: var(--font-bold);
line-height: var(--leading-tight);
letter-spacing: var(--tracking-tight);
```

### H2 - Section Header
```css
font-family: var(--font-sans);
font-size: var(--text-2xl);
font-weight: var(--font-semibold);
line-height: var(--leading-tight);
```

### H3 - Card Title
```css
font-family: var(--font-sans);
font-size: var(--text-xl);
font-weight: var(--font-semibold);
line-height: var(--leading-snug);
```

### Body
```css
font-family: var(--font-sans);
font-size: var(--text-base);
font-weight: var(--font-normal);
line-height: var(--leading-normal);
```

### Body Small
```css
font-family: var(--font-sans);
font-size: var(--text-sm);
font-weight: var(--font-normal);
line-height: var(--leading-normal);
```

### Caption
```css
font-family: var(--font-sans);
font-size: var(--text-xs);
font-weight: var(--font-medium);
line-height: var(--leading-normal);
letter-spacing: var(--tracking-wide);
text-transform: uppercase;
```

### Code
```css
font-family: var(--font-mono);
font-size: var(--text-sm);
font-weight: var(--font-normal);
line-height: var(--leading-normal);
```

## Usage Examples

### Page Header
```jsx
<h1 className="text-3xl font-bold tracking-tight text-gray-900">
  Agents
</h1>
```

### Card Title
```jsx
<h3 className="text-xl font-semibold text-gray-900">
  Budget Overview
</h3>
```

### Body Text
```jsx
<p className="text-base text-gray-600">
  Configure your agent's budget and schedule settings.
</p>
```

### Button Text
```jsx
<Button className="text-sm font-medium">
  Top Up Budget
</Button>
```

### Input Label
```jsx
<Label className="text-sm font-semibold text-gray-700">
  Budget Amount
</Label>
```

## Accessibility

- Minimum font size: 14px for body text
- Use relative units (rem) for scalability
- Ensure sufficient contrast with background colors
