# Foundation: Motion

## Animation Timing

### Duration Scale

| Token                | Value | Usage               |
| -------------------- | ----- | ------------------- |
| `--duration-instant` | 50ms  | Micro-interactions  |
| `--duration-fast`    | 100ms | Hover states        |
| `--duration-normal`  | 200ms | Default transitions |
| `--duration-slow`    | 300ms | Modals, panels      |
| `--duration-slower`  | 500ms | Complex animations  |

### Easing Functions

```css
--ease-default: cubic-bezier(0.4, 0, 0.2, 1);
--ease-in: cubic-bezier(0.4, 0, 1, 1);
--ease-out: cubic-bezier(0, 0, 0.2, 1);
--ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);
--ease-bounce: cubic-bezier(0.68, -0.55, 0.265, 1.55);
```

## Common Transitions

### Fade In

```css
@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.fade-in {
  animation: fadeIn var(--duration-normal) var(--ease-out);
}
```

### Fade Out

```css
@keyframes fadeOut {
  from {
    opacity: 1;
  }
  to {
    opacity: 0;
  }
}

.fade-out {
  animation: fadeOut var(--duration-fast) var(--ease-in);
}
```

### Scale In

```css
@keyframes scaleIn {
  from {
    opacity: 0;
    transform: scale(0.95);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

.scale-in {
  animation: scaleIn var(--duration-normal) var(--ease-out);
}
```

### Slide In Up

```css
@keyframes slideInUp {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.slide-in-up {
  animation: slideInUp var(--duration-normal) var(--ease-out);
}
```

### Slide In Down

```css
@keyframes slideInDown {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.slide-in-down {
  animation: slideInDown var(--duration-normal) var(--ease-out);
}
```

## Hover Animations

### Button Hover

```css
.button {
  transition:
    background-color var(--duration-fast) var(--ease-default),
    box-shadow var(--duration-fast) var(--ease-default),
    transform var(--duration-fast) var(--ease-default);
}

.button:hover {
  transform: translateY(-1px);
}

.button:active {
  transform: translateY(0);
}
```

### Card Hover

```css
.card {
  transition:
    box-shadow var(--duration-normal) var(--ease-default),
    transform var(--duration-normal) var(--ease-default);
}

.card:hover {
  box-shadow: var(--shadow-lg);
  transform: translateY(-2px);
}
```

### Link Hover

```css
.link {
  transition: color var(--duration-fast) var(--ease-default);
}

.link:hover {
  color: var(--color-brand-primary);
}
```

## Loading Animations

### Spinner

```css
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.spinner {
  width: 20px;
  height: 20px;
  border: 2px solid var(--color-gray-200);
  border-top-color: var(--color-brand-primary);
  border-radius: 50%;
  animation: spin var(--duration-slower) linear infinite;
}
```

### Skeleton Pulse

```css
@keyframes shimmer {
  0% {
    background-position: -200% 0;
  }
  100% {
    background-position: 200% 0;
  }
}

.skeleton {
  background: linear-gradient(
    90deg,
    var(--color-gray-100) 25%,
    var(--color-gray-200) 50%,
    var(--color-gray-100) 75%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s ease-in-out infinite;
}
```

### Progress Bar

```css
@keyframes progress {
  0% {
    width: 0%;
  }
  100% {
    width: 100%;
  }
}

.progress-bar {
  height: 4px;
  background: var(--color-brand-primary);
  border-radius: var(--radius-full);
  transition: width var(--duration-slow) var(--ease-out);
}
```

## Toast Animations

### Toast Enter

```css
@keyframes toastEnter {
  from {
    opacity: 0;
    transform: translateX(100%);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

.toast-enter {
  animation: toastEnter var(--duration-normal) var(--ease-out);
}
```

### Toast Exit

```css
@keyframes toastExit {
  from {
    opacity: 1;
    transform: translateX(0);
  }
  to {
    opacity: 0;
    transform: translateX(100%);
  }
}

.toast-exit {
  animation: toastExit var(--duration-fast) var(--ease-in);
}
```

## Modal Animations

### Modal Backdrop

```css
.modal-backdrop {
  animation: fadeIn var(--duration-normal) var(--ease-out);
}
```

### Modal Content

```css
.modal-content {
  animation: scaleIn var(--duration-slow) var(--ease-out);
}
```

## Reduced Motion

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

## Accessibility

- Respect `prefers-reduced-motion`
- Don't use animation for critical information
- Ensure animations don't cause seizures
- Provide non-animated alternatives
- Test with screen readers

## Usage Guidelines

### Do

- Use consistent animation durations
- Choose appropriate easing for the context
- Test on reduced motion preferences
- Keep animations subtle and purposeful

### Don't

- Don't animate layout properties (width, height) for performance
- Don't use excessive animation duration
- Don't animate during critical user actions
