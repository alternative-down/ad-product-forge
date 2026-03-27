# Component: Card

## Anatomy

A card consists of:
- Container (border, shadow, radius)
- Header (optional)
- Body content
- Footer (optional)

## Base Card

```css
.card {
  background: var(--color-white);
  border: 1px solid var(--color-gray-200);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  overflow: hidden;
}
```

## Card Variants

### Elevated Card
```css
.card-elevated {
  border: none;
  box-shadow: var(--shadow-md);
}
```

### Outlined Card
```css
.card-outlined {
  background: transparent;
  border: 1px solid var(--color-gray-200);
  box-shadow: none;
}
```

### Filled Card
```css
.card-filled {
  background: var(--color-gray-50);
  border: none;
  box-shadow: none;
}
```

## Card Sizes

| Size | Padding | Gap |
|------|---------|-----|
| `sm` | var(--space-3) | var(--space-2) |
| `md` | var(--space-4) | var(--space-3) |
| `lg` | var(--space-6) | var(--space-4) |

## Card Sections

### Card Header
```css
.card-header {
  padding: var(--space-4) var(--space-6);
  border-bottom: 1px solid var(--color-gray-100);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
}
```

### Card Body
```css
.card-body {
  padding: var(--space-6);
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}
```

### Card Footer
```css
.card-footer {
  padding: var(--space-4) var(--space-6);
  border-top: 1px solid var(--color-gray-100);
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-3);
}
```

## Interactive Card

```css
.card-interactive {
  cursor: pointer;
  transition: box-shadow 200ms, border-color 200ms;
}

.card-interactive:hover {
  box-shadow: var(--shadow-md);
  border-color: var(--color-gray-300);
}

.card-interactive:focus-within {
  outline: 2px solid var(--color-brand-primary);
  outline-offset: 2px;
}
```

## Card with Status Indicator

```css
.card-status {
  border-left: 4px solid var(--color-gray-200);
}

.card-status-active {
  border-left-color: var(--color-success-500);
}

.card-status-warning {
  border-left-color: var(--color-warning-500);
}

.card-status-error {
  border-left-color: var(--color-error-500);
}
```

## Usage Examples

### Agent Card
```jsx
<Card variant="elevated" size="md">
  <CardHeader>
    <AgentAvatar agent={agent} />
    <div>
      <CardTitle>{agent.name}</CardTitle>
      <CardDescription>Started {formatDate(agent.startsAt)}</CardDescription>
    </div>
    <StatusBadge status={agent.status} />
  </CardHeader>
  <CardBody>
    <BudgetProgressCard 
      spent={agent.spentUsd}
      total={agent.weeklyValueUsd}
    />
    <Stat label="Schedules" value={agent.scheduleCount} />
    <Stat label="Tasks" value={agent.taskCount} />
  </CardBody>
  <CardFooter>
    <Button variant="ghost" size="sm">View Details</Button>
    <Button variant="primary" size="sm">Manage</Button>
  </CardFooter>
</Card>
```

### Budget Card
```jsx
<Card>
  <CardHeader>
    <CardTitle>Budget Overview</CardTitle>
    <Button variant="ghost" size="icon">
      <RefreshIcon />
    </Button>
  </CardHeader>
  <CardBody>
    <BudgetProgress 
      spent={100}
      total={500}
      format="currency"
    />
    <div className="stat-grid">
      <Stat label="Spent" value="$100" />
      <Stat label="Remaining" value="$400" />
      <Stat label="This Week" value="$250" />
    </div>
  </CardBody>
</Card>
```

### Compact Card (for lists)
```jsx
<Card variant="outlined" size="sm">
  <CardBody className="flex-row items-center gap-3">
    <Icon />
    <div className="flex-1">
      <CardTitle className="text-sm">Title</CardTitle>
    </div>
    <Badge>Status</Badge>
  </CardBody>
</Card>
```

## Responsive Behavior

```css
/* Mobile: Full width cards */
@media (max-width: 640px) {
  .card {
    border-radius: var(--radius-md);
  }
  
  .card-header,
  .card-body,
  .card-footer {
    padding: var(--space-4);
  }
}
```

## Accessibility

- Use semantic headings (h2-h6) for card titles
- Ensure interactive cards have visible focus states
- Provide alt text for card images
- Associate card content with proper landmarks

## Do's and Don'ts

### Do
- Use consistent card hierarchy within a view
- Provide meaningful card titles
- Keep card content focused and scannable
- Use appropriate card size for the content

### Don't
- Don't nest cards within cards
- Don't overload cards with too much information
- Don't use cards for simple, inline content
