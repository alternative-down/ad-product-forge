# Design Tokens: Spacing

## Spacing Scale

Base unit: `4px` (0.25rem)

| Token | Value | Pixels | Usage |
|-------|-------|--------|-------|
| `--space-0` | `0` | 0px | No spacing |
| `--space-1` | `0.25rem` | 4px | Tight inline spacing |
| `--space-2` | `0.5rem` | 8px | Icon gaps, tight padding |
| `--space-3` | `0.75rem` | 12px | Small gaps |
| `--space-4` | `1rem` | 16px | Default padding/margin |
| `--space-5` | `1.25rem` | 20px | Medium gaps |
| `--space-6` | `1.5rem` | 24px | Card padding |
| `--space-8` | `2rem` | 32px | Section gaps |
| `--space-10` | `2.5rem` | 40px | Large gaps |
| `--space-12` | `3rem` | 48px | Page sections |
| `--space-16` | `4rem` | 64px | Major sections |
| `--space-20` | `5rem` | 80px | Hero spacing |
| `--space-24` | `6rem` | 96px | Large margins |

## Padding Patterns

### Card Padding
```css
/* Compact card */
padding: var(--space-4);

/* Standard card */
padding: var(--space-6);

/* Large card */
padding: var(--space-8);
```

### Button Padding
```css
/* Small button */
padding: var(--space-2) var(--space-3);

/* Default button */
padding: var(--space-2) var(--space-4);

/* Large button */
padding: var(--space-3) var(--space-6);
```

### Input Padding
```css
padding: var(--space-2) var(--space-3);
```

### Page Padding
```css
/* Mobile */
padding: var(--space-4);

/* Tablet */
padding: var(--space-6);

/* Desktop */
padding: var(--space-8);
```

## Margin Patterns

### Section Margins
```css
/* Between related items */
margin-bottom: var(--space-4);

/* Between sections */
margin-bottom: var(--space-8);

/* Between page areas */
margin-bottom: var(--space-12);
```

### Stack Gaps (Flex/Grid)
```css
/* Tight stack */
gap: var(--space-2);

/* Default stack */
gap: var(--space-4);

/* Relaxed stack */
gap: var(--space-6);

/* Large stack */
gap: var(--space-8);
```

## Gap Scale for Lists

| Token | Value | Usage |
|-------|-------|-------|
| `--gap-xs` | `var(--space-2)` | 8px - Icon + text |
| `--gap-sm` | `var(--space-3)` | 12px - Small list items |
| `--gap-md` | `var(--space-4)` | 16px - Default list |
| `--gap-lg` | `var(--space-6)` | 24px - Card grids |
| `--gap-xl` | `var(--space-8)` | 32px - Section grids |

## Border Radius

| Token | Value | Usage |
|-------|-------|-------|
| `--radius-none` | `0` | Sharp edges |
| `--radius-sm` | `0.125rem` (2px) | Subtle rounding |
| `--radius-md` | `0.375rem` (6px) | Buttons, inputs |
| `--radius-lg` | `0.5rem` (8px) | Cards |
| `--radius-xl` | `0.75rem` (12px) | Modals, panels |
| `--radius-2xl` | `1rem` (16px) | Large cards |
| `--radius-full` | `9999px` | Pills, avatars |

### Border Radius Usage
```css
/* Buttons */
border-radius: var(--radius-md);

/* Inputs */
border-radius: var(--radius-md);

/* Cards */
border-radius: var(--radius-lg);

/* Modals */
border-radius: var(--radius-xl);

/* Badges/Pills */
border-radius: var(--radius-full);

/* Avatar */
border-radius: var(--radius-full);
```

## Container Widths

| Token | Value | Usage |
|-------|-------|-------|
| `--container-sm` | `640px` | Narrow content |
| `--container-md` | `768px` | Standard content |
| `--container-lg` | `1024px` | Wide content |
| `--container-xl` | `1280px` | Full content |
| `--container-2xl` | `1536px` | Maximum |

## Usage in Components

### Form Layout
```css
.form-group {
  margin-bottom: var(--space-4);
}

.form-row {
  display: grid;
  gap: var(--space-4);
}
```

### Card Component
```css
.card {
  padding: var(--space-6);
  border-radius: var(--radius-lg);
  gap: var(--space-4);
}
```

### List Item
```css
.list-item {
  padding: var(--space-3) var(--space-4);
  gap: var(--space-3);
}
```

## Responsive Spacing

```css
/* Mobile first */
margin-bottom: var(--space-4);

/* Tablet+ */
@media (min-width: 768px) {
  margin-bottom: var(--space-6);
}

/* Desktop+ */
@media (min-width: 1024px) {
  margin-bottom: var(--space-8);
}
```

## Accessibility

- Touch targets minimum: 44x44px (11x space units)
- Ensure adequate breathing room between interactive elements
- Maintain consistent spacing rhythm throughout the UI
