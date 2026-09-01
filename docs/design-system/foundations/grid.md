# Foundation: Grid

## Grid System

Base unit: 4px

## Layout Grid

### Desktop Grid (12 columns)

```css
.grid-12 {
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  gap: var(--space-6);
}
```

### Column Spans

| Class         | Columns | Width  |
| ------------- | ------- | ------ |
| `col-span-1`  | 1       | 8.33%  |
| `col-span-2`  | 2       | 16.67% |
| `col-span-3`  | 3       | 25%    |
| `col-span-4`  | 4       | 33.33% |
| `col-span-6`  | 6       | 50%    |
| `col-span-8`  | 8       | 66.67% |
| `col-span-12` | 12      | 100%   |

## Responsive Breakpoints

| Breakpoint | Min Width | Columns | Gutter | Container |
| ---------- | --------- | ------- | ------ | --------- |
| `sm`       | 640px     | 12      | 16px   | 640px     |
| `md`       | 768px     | 12      | 24px   | 768px     |
| `lg`       | 1024px    | 12      | 24px   | 1024px    |
| `xl`       | 1280px    | 12      | 32px   | 1280px    |
| `2xl`      | 1536px    | 12      | 32px   | 1536px    |

## Flex Layout

### Flex Container

```css
.flex {
  display: flex;
}

.flex-col {
  flex-direction: column;
}

.flex-wrap {
  flex-wrap: wrap;
}
```

### Flex Alignment

```css
.items-start {
  align-items: flex-start;
}
.items-center {
  align-items: center;
}
.items-end {
  align-items: flex-end;
}
.items-stretch {
  align-items: stretch;
}

.justify-start {
  justify-content: flex-start;
}
.justify-center {
  justify-content: center;
}
.justify-end {
  justify-content: flex-end;
}
.justify-between {
  justify-content: space-between;
}
```

### Flex Gaps

```css
.gap-1 {
  gap: var(--space-1);
}
.gap-2 {
  gap: var(--space-2);
}
.gap-3 {
  gap: var(--space-3);
}
.gap-4 {
  gap: var(--space-4);
}
.gap-6 {
  gap: var(--space-6);
}
.gap-8 {
  gap: var(--space-8);
}
```

## Page Layout

### Standard Page

```css
.page {
  padding: var(--space-6);
  max-width: var(--container-xl);
  margin: 0 auto;
}

/* With sidebar */
.page-with-sidebar {
  display: grid;
  grid-template-columns: 280px 1fr;
  gap: var(--space-6);
}
```

### Dashboard Layout

```css
.dashboard-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: var(--space-6);
}
```

## Card Grid

```css
.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: var(--space-6);
}

/* Compact grid for smaller cards */
.card-grid-compact {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: var(--space-4);
}
```

## Form Layout

### Vertical Form

```css
.form-vertical {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}
```

### Two Column Form

```css
.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-4);
}

/* Responsive: stack on mobile */
@media (max-width: 640px) {
  .form-row {
    grid-template-columns: 1fr;
  }
}
```

## Usage Examples

### Page with Cards

```jsx
<div className="page">
  <PageHeader title="Agents" />
  <div className="dashboard-grid">
    {agents.map((agent) => (
      <AgentCard key={agent.id} agent={agent} />
    ))}
  </div>
</div>
```

### Two-Column Form

```jsx
<form className="form-vertical">
  <div className="form-row">
    <InputWrapper>
      <Label>First Name</Label>
      <Input />
    </InputWrapper>
    <InputWrapper>
      <Label>Last Name</Label>
      <Input />
    </InputWrapper>
  </div>
  <InputWrapper>
    <Label>Email</Label>
    <Input type="email" />
  </InputWrapper>
</form>
```

## Accessibility

- Use semantic HTML elements (main, nav, aside, section)
- Ensure logical tab order follows visual layout
- Provide skip links for complex layouts
- Maintain readable line lengths (60-80 characters)
