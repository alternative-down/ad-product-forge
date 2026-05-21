# Design Tokens: Colors

## Brand Colors

| Token                     | Hex       | Usage                            |
| ------------------------- | --------- | -------------------------------- |
| `--color-brand-primary`   | `#6366F1` | Primary actions, brand identity  |
| `--color-brand-secondary` | `#8B5CF6` | Secondary accents, highlights    |
| `--color-brand-accent`    | `#F59E0B` | Attention, badges, notifications |

## Semantic Colors

### Success

| Token                 | Hex       | Usage                    |
| --------------------- | --------- | ------------------------ |
| `--color-success-50`  | `#ECFDF5` | Success background light |
| `--color-success-100` | `#D1FAE5` | Success border light     |
| `--color-success-500` | `#10B981` | Success text/border      |
| `--color-success-600` | `#059669` | Success text dark        |
| `--color-success-700` | `#047857` | Success text darkest     |

### Warning

| Token                 | Hex       | Usage                    |
| --------------------- | --------- | ------------------------ |
| `--color-warning-50`  | `#FFFBEB` | Warning background light |
| `--color-warning-100` | `#FEF3C7` | Warning border light     |
| `--color-warning-500` | `#F59E0B` | Warning text/border      |
| `--color-warning-600` | `#D97706` | Warning text dark        |
| `--color-warning-700` | `#B45309` | Warning text darkest     |

### Error

| Token               | Hex       | Usage                  |
| ------------------- | --------- | ---------------------- |
| `--color-error-50`  | `#FEF2F2` | Error background light |
| `--color-error-100` | `#FEE2E2` | Error border light     |
| `--color-error-500` | `#EF4444` | Error text/border      |
| `--color-error-600` | `#DC2626` | Error text dark        |
| `--color-error-700` | `#B91C1C` | Error text darkest     |

### Info

| Token              | Hex       | Usage                 |
| ------------------ | --------- | --------------------- |
| `--color-info-50`  | `#EFF6FF` | Info background light |
| `--color-info-100` | `#DBEAFE` | Info border light     |
| `--color-info-500` | `#3B82F6` | Info text/border      |
| `--color-info-600` | `#2563EB` | Info text dark        |
| `--color-info-700` | `#1D4ED8` | Info text darkest     |

## Neutral Colors

| Token              | Hex       | Usage              |
| ------------------ | --------- | ------------------ |
| `--color-white`    | `#FFFFFF` | Background, cards  |
| `--color-gray-50`  | `#F9FAFB` | Page background    |
| `--color-gray-100` | `#F3F4F6` | Subtle backgrounds |
| `--color-gray-200` | `#E5E7EB` | Borders, dividers  |
| `--color-gray-300` | `#D1D5DB` | Disabled states    |
| `--color-gray-400` | `#9CA3AF` | Placeholder text   |
| `--color-gray-500` | `#6B7280` | Secondary text     |
| `--color-gray-600` | `#4B5563` | Body text          |
| `--color-gray-700` | `#374151` | Primary text       |
| `--color-gray-800` | `#1F2937` | Headings           |
| `--color-gray-900` | `#111827` | Dark text          |
| `--color-black`    | `#000000` | Text on light      |

## Budget Status Colors

| Token                     | Hex       | Usage         |
| ------------------------- | --------- | ------------- |
| `--color-budget-normal`   | `#10B981` | < 50% spent   |
| `--color-budget-caution`  | `#F59E0B` | 50-75% spent  |
| `--color-budget-warning`  | `#F97316` | 75-90% spent  |
| `--color-budget-critical` | `#EF4444` | 90-100% spent |
| `--color-budget-over`     | `#DC2626` | > 100% spent  |

## Agent Status Colors

| Token                   | Hex       | Usage          |
| ----------------------- | --------- | -------------- |
| `--color-agent-active`  | `#10B981` | Agent running  |
| `--color-agent-idle`    | `#6B7280` | Agent idle     |
| `--color-agent-error`   | `#EF4444` | Agent error    |
| `--color-agent-pending` | `#F59E0B` | Agent starting |

## Usage Guidelines

### Backgrounds

- Page: `--color-gray-50`
- Card: `--color-white`
- Modal overlay: `rgba(0, 0, 0, 0.5)`

### Text

- Primary: `--color-gray-700`
- Secondary: `--color-gray-500`
- Disabled: `--color-gray-400`

### Borders

- Default: `--color-gray-200`
- Focus: `--color-brand-primary`
- Error: `--color-error-500`

## Accessibility

- Minimum contrast ratio: 4.5:1 for normal text
- Minimum contrast ratio: 3:1 for large text
- Never use color alone to convey information
