# Forge Admin UI System

## Goal
Create a new admin UI for Forge that feels light, friendly, and expressive without becoming theatrical, corporate, or cinematic.

This UI should:
- feel easy to use
- feel calm and clear
- keep strong information hierarchy
- avoid dashboard clutter
- work well as a system interface, not as a marketing site

## Visual Direction
The design direction is:

**Friendly minimal system UI with subtle anime influence**

That means:
- light and human, not industrial
- expressive in a quiet way, not cinematic
- clean and restrained, but not cold
- memorable, but still highly usable

The anime influence should be subtle:
- gentle color relationships
- soft emotional tone
- airy composition
- slightly expressive typography and rhythm

It must not become:
- fan-art styling
- neon-heavy styling
- cinematic hero layouts
- dramatic visual effects
- busy illustration-driven UI

## Product Feel
The UI should feel like:
- a good desk app
- easy to approach
- calm under pressure
- designed with taste

It should not feel like:
- enterprise dashboard UI
- heavy admin template UI
- technical control panel UI
- industrial console UI

## Shell
The system shell should be simple and predictable.

Structure:
- fixed left sidebar
- light top bar
- continuous main content area
- optional right detail pane when needed

The shell should prioritize:
- orientation
- low friction
- easy scanning
- stable navigation

Primary shell pieces:
- `AppShell`
- `SidebarNav`
- `TopBar`
- `PageHeader`
- `ContentFrame`
- `SectionBlock`
- `DetailPane`

## Layout Rules
- Prefer one continuous page flow over many isolated modules.
- Prefer section separation through spacing, headings, and dividers rather than stacked cards.
- Use cards only when the interaction truly needs a contained box.
- Keep page width controlled.
- Use whitespace generously.
- Keep alignment disciplined and obvious.

Preferred page patterns:
- list + detail
- table + filters
- linear form
- timeline/log
- split workspace

Avoid:
- dashboard grids full of summary cards
- too many boxes on one screen
- multiple competing emphasis zones

## Typography
Primary font:
- `Instrument Sans`

Technical/supporting font:
- `IBM Plex Mono`

Usage:
- titles: `Instrument Sans`
- body: `Instrument Sans`
- metadata, ids, cron, dates, logs, technical values: `IBM Plex Mono`

Type scale:
- page title: `28`
- section title: `18`
- body: `14`
- small/meta: `12`

Tone:
- readable
- warm
- modern
- not corporate

## Spacing
Spacing scale:
- `4`
- `8`
- `12`
- `16`
- `24`
- `32`
- `40`
- `56`

Control heights:
- compact: `32`
- default: `36`
- emphasized: `40`

Corner radius:
- small only
- default max radius: `8`

## Color System
The palette should stay bright, soft, and stable.

Base colors:
- background: warm off-white
- surface: soft neutral
- border: light warm gray
- text: dark graphite
- muted text: medium warm gray

Accent color:
- one primary accent only
- recommended direction: soft but confident blue

State colors:
- success: natural green
- warning: warm amber
- danger: muted red

Color should support:
- clarity
- hierarchy
- friendliness

Color should not be used for:
- spectacle
- gradients as a core language
- glowing emphasis
- decorative noise

## Interaction Principles
- Primary action must always be obvious.
- Secondary actions should stay visible but quiet.
- Forms should feel linear and low-friction.
- Empty states should be helpful and short.
- Labels should be human and direct.
- Technical details should appear only when useful.
- Feedback should be immediate and calm.

## Copy Rules
- Avoid technical explanatory text by default.
- Do not narrate implementation details to the user.
- Prefer short labels and concise helper text.
- Use plain language first.

## Component Strategy
Prefer `shadcn/ui` as the base layer.

Use existing `shadcn` components whenever possible:
- `button`
- `input`
- `textarea`
- `select`
- `table`
- `tabs`
- `dialog`
- `sheet`
- `separator`
- `badge`
- `tooltip`

Do not modify generated `shadcn/ui` files in place.

If a variation is needed:
- create a wrapper
- compose a new component
- apply styling outside the generated component folder

## Planned Custom Components
These are the primary wrapper/system components for the new admin UI:
- `AppShell`
- `SidebarNav`
- `TopBar`
- `PageHeader`
- `SectionBlock`
- `SectionHeader`
- `Toolbar`
- `FilterBar`
- `ActionBar`
- `FieldRow`
- `FormSection`
- `DataTable`
- `InlineStat`
- `StatusBadge`
- `EmptyState`
- `DetailPane`
- `TimelineList`
- `LogBlock`
- `KeyValueList`
- `DangerZone`

## Routing Rules
Admin routes must use directory-based TanStack file routing:
- `route.tsx`
- `index.tsx`

Do not create filename-based route modules for new or refactored admin routes.

## UI Rules To Preserve
- Avoid cards as the default layout primitive.
- Keep the UI light and friendly.
- Do not introduce enterprise dashboard aesthetics.
- Do not introduce industrial UI aesthetics.
- Keep the anime influence subtle and non-cinematic.
- Keep the interface simple to navigate and easy to scan.

## Build Order
The new UI should be built in this order:
1. shell
2. typography and color tokens
3. base layout wrappers
4. form primitives and table wrappers
5. page migrations

The goal is to create one coherent system first, then migrate screens into it.
