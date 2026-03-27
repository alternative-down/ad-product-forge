# Foundation: Elevation

## Z-Index Scale

| Token | Value | Usage |
|-------|-------|-------|
| `--z-0` | 0 | Base content |
| `--z-10` | 10 | Sticky elements |
| `--z-20` | 20 | Fixed elements |
| `--z-30` | 30 | Dropdowns |
| `--z-40` | 40 | Sticky headers |
| `--z-50` | 50 | Modals |
| `--z-60` | 60 | Popovers |
| `--z-70` | 70 | Tooltips |
| `--z-80` | 80 | Toast notifications |

## Layer Order

```
z-80: Toast notifications (topmost)
z-70: Tooltips
z-60: Popovers
z-50: Modals
z-40: Sticky headers
z-30: Dropdowns
z-20: Fixed elements
z-10: Sticky elements
z-0:  Base content
```

## Modal Overlay

```css
.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: var(--z-50);
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
}
```

## Dropdown Layer

```css
.dropdown {
  position: absolute;
  z-index: var(--z-30);
  box-shadow: var(--shadow-lg);
}
```

## Sticky Header

```css
.header {
  position: sticky;
  top: 0;
  z-index: var(--z-40);
  background: var(--color-white);
}
```

## Toast Positioning

```css
.toast-container {
  position: fixed;
  bottom: var(--space-6);
  right: var(--space-6);
  z-index: var(--z-80);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

/* Stack toasts */
.toast + .toast {
  margin-top: var(--space-2);
}
```

## Layer Stacking Context

### Modal Example
```css
.modal {
  position: fixed;
  inset: 0;
  z-index: var(--z-50);
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal-content {
  position: relative;
  z-index: 1;
  max-width: 500px;
  background: var(--color-white);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-2xl);
}
```

### Nested Dropdown Example
```css
.dropdown {
  position: absolute;
  z-index: var(--z-30);
}

.dropdown-menu {
  position: absolute;
  top: 100%;
  left: 0;
  z-index: calc(var(--z-30) + 1);
}
```

## Layering Guidelines

### Do
- Use the z-index scale consistently
- Keep z-index values as low as possible
- Use `position: fixed` or `position: absolute` with z-index
- Document custom z-index values

### Don't
- Don't use z-index values above 100 without documentation
- Don't create stacking conflicts with fixed elements
- Don't rely solely on z-index for layering - use position too

## Accessibility

- Ensure modal overlays don't trap focus incorrectly
- Make sure fixed elements don't overlap important content
- Test keyboard navigation with layered elements
