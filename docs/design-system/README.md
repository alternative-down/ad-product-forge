# Design System - ad-product-forge

**Status**: Preliminary Foundation (v0.1.0)

## Overview

This is the preliminary design system for ad-product-forge. It provides a foundation of design tokens, components, and foundations that can be used across the application.

## Structure

```
docs/design-system/
├── tokens/
│   ├── colors.md       # Color palette and semantic tokens
│   ├── typography.md   # Font families, sizes, weights
│   ├── spacing.md      # Spacing scale and patterns
│   └── shadows.md      # Shadow/elevation tokens
├── components/
│   ├── button.md       # Button variants and states
│   ├── input.md        # Input variants and validation
│   └── card.md         # Card layouts and variants
└── foundations/
    ├── grid.md         # Layout grid and breakpoints
    ├── elevation.md    # Z-index scale and layering
    └── motion.md       # Animation timing and easing
```

## Design Tokens

Design tokens are the atomic values that define the visual language:

- **Colors**: Brand colors, semantic colors, status colors
- **Typography**: Font families, sizes, weights, line heights
- **Spacing**: Spacing scale, padding patterns, gaps
- **Shadows**: Shadow scale, elevation levels

## Components

Reusable UI building blocks:

- **Button**: Primary, Secondary, Ghost, Destructive variants
- **Input**: Text, Number, Password with validation states
- **Card**: Elevated, Outlined, Filled variants

## Foundations

Structural patterns:

- **Grid**: Layout grid, responsive breakpoints
- **Elevation**: Z-index scale, layer stacking
- **Motion**: Animation timing, easing functions

## Usage

### Tailwind CSS Integration

The tokens map to Tailwind utilities:

```css
/* Colors */
bg-brand-primary     → var(--color-brand-primary)
text-gray-700        → var(--color-gray-700)

/* Spacing */
p-4                  → padding: var(--space-4)
gap-4                → gap: var(--space-4)

/* Typography */
text-base            → font-size: var(--text-base)
font-semibold        → font-weight: var(--font-semibold)

/* Shadows */
shadow-sm            → box-shadow: var(--shadow-sm)
shadow-lg            → box-shadow: var(--shadow-lg)

/* Border Radius */
rounded-md           → border-radius: var(--radius-md)
rounded-lg           → border-radius: var(--radius-lg)
```

### Component Classes

```jsx
// Button
<button className="btn btn-primary btn-md">
  Action
</button>

// Input
<div className="input-wrapper">
  <label className="label">Label</label>
  <input className="input" />
</div>

// Card
<div className="card card-elevated">
  <div className="card-header">Title</div>
  <div className="card-body">Content</div>
</div>
```

## Status

| Category   | Status        | Notes                            |
| ---------- | ------------- | -------------------------------- |
| Colors     | ✅ Foundation | Brand, semantic, neutral, status |
| Typography | ✅ Foundation | Fonts, sizes, weights, styles    |
| Spacing    | ✅ Foundation | Scale, patterns, radius          |
| Shadows    | ✅ Foundation | Shadow scale, elevation          |
| Grid       | ✅ Foundation | Breakpoints, containers          |
| Elevation  | ✅ Foundation | Z-index scale                    |
| Motion     | ✅ Foundation | Timing, easing, animations       |
| Button     | ✅ Foundation | All variants and states          |
| Input      | ✅ Foundation | All variants and validation      |
| Card       | ✅ Foundation | All variants and sections        |

## Next Steps

- [ ] Add Badge component
- [ ] Add Modal component
- [ ] Add Dropdown/Select component
- [ ] Add Table component
- [ ] Add Toast component
- [ ] Add Avatar component
- [ ] Create Figma component library
- [ ] Add dark mode tokens
- [ ] Create usage guidelines per component

## Contributing

When adding new components:

1. Create component documentation in `docs/design-system/components/`
2. Define tokens in appropriate `tokens/` file
3. Update this README
4. Create PR for review

## References

- Nielsen UX Heuristics: Implemented in wireframes at `docs/ux/`
- Brand Voice Guidelines: `docs/BRAND-VOICE.md`
- Toast Patterns: `docs/Toast-Patterns.md`
- Error Dictionary: `docs/Error-Message-Dictionary.md`
- Empty States: `docs/Empty-States.md`
- Loading States: `docs/Loading-States.md`
