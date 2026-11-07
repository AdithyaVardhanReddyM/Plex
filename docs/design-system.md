# Plex web: design system

The app is judged on design. The bar is Mercury, Ramp, Linear and Stripe's dashboard: calm, exact, dense where it should be, with one brand moment per screen. Never generic, never loud. Light only.

## The frame

- **Shell** (`components/shell/app-shell.tsx`): the sidebar sits on the canvas (`bg-canvas`); every screen renders inside a white-ish content sheet (`bg-panel`, rounded, bordered) with a sticky top bar (breadcrumbs, search, approvals bell, Post a task). Screens scroll inside `#app-scroll`, not the window. Sticky asides use `lg:sticky lg:top-20` (below the 56px top bar).
- A pale aurora wash sits behind the top of every page already. Don't add another gradient ground.
- Content width is capped at 1280px. Don't add another max-width wrapper unless the page is a narrow form (then `max-w-3xl` or so, left-aligned with the header).

## Type

- UI: Geist. Titles and the one big figure on a screen: Manrope via `font-display` (bold, tight tracking, for example `font-display text-[28px] font-bold tracking-[-0.03em]`).
- Sizes: page title 28–30px (PageHeader does it), card title 14.5px semibold, body 13–14px, meta 12–12.5px, micro labels 11.5px `text-faint` in sentence case. No uppercase eyebrows, no letter-spaced caps.
- Money: `<Amount>` always (`size="lg"`/`"xl"` already use the display face). Tabular figures (`tabular`) wherever numbers line up.

## Color

- Tokens only, never raw hex: `ink`, `ink-2`, `muted`, `faint`, `line`, `line-strong`, `canvas`, `panel`, `surface`, `sunken`; brand `green-*` (mint→aqua) for money that moved and success; `steel-*` for money that's held; `refunded`/`disputed` (+ `-bg`) for those states.
- Green fills 200–400 take ink text, never white. Text on white uses `green-700/800`.
- Gradients only through `var(--meter-brand)`, `var(--meter-steel)`, `var(--metal)` (the receipt foil edge, and anything that is "held"). No purple, no stock AI sparkles, no emoji as icons.

## Primitives (use them before writing new UI)

From `@/components/ui/primitives`:
- `Card` (14px radius, border, soft shadow), `CardHeader` (`title`, `description`, `action`, `icon`, `divider`).
- `PageHeader` (`eyebrow`, `title`, `description`, `actions`, `icon`). Every screen starts with one.
- `SectionHeading` for a group of cards.
- `IconTile` (tones `neutral | mint | steel | ink | white | amber | red`, sizes `xs | sm | md | lg`): the one way to put an icon on a tile.
- `Badge` (tones `neutral | green | steel | amber | red | outline | ink`), `StatusDot` (`live` pulses).
- `Segmented` (tabs and filters with a sliding white pill; `count` per item). Replace every hand-built tab row and pill filter with it.
- `Meter` (brand/steel gradient bar), `Stat` (label, value, foot), `Switch`, `Avatar` (`square` for agents, orgs, brands), `Input`, `Textarea`, `Label`, `Kbd`, `Skeleton`, `EmptyState` (`icon` or `art`).
- `Button` / `buttonVariants` (capsules): `primary` ink for the main action, `brand` mint only when money moves (fund, approve, release, donate), `secondary`, `ghost`, `danger`. Sizes `sm | md | lg | icon | icon-sm`.
- From `@/components/ui/viz`: `Ring` (progress ring), `DayBars` (daily columns), `Sparkline`.
- From `@/components/receipt/receipt`: `ReceiptCard`, `ReceiptRow`, `ReceiptKindIcon`, `StatePill`.

## Composition rules

- One focal object per screen: the thing the screen is about gets the size, the weight, the brand color. Everything else is quiet.
- Hierarchy from proportion, space and type weight, not from more boxes. Don't nest bordered cards three deep; inside a card use `bg-canvas/50` wells, dividers (`divide-y divide-line`) or `rounded-[12px] border border-line` sub-blocks at most.
- Lists: rows with `rounded-[10px] px-3 py-2.5 hover:bg-sunken/70`, a 34px leading tile or avatar, title 13.5px medium, meta 12px muted, value and status right-aligned. Rows share one grid template so columns line up.
- Spacing scale: 4, 8, 12, 16, 20, 24, 32. Cards are 16px apart (`gap-4`). Card padding 20px (`p-5`); dense card bodies 16px.
- Radii: cards 14px (`rounded-lg`), sub-blocks and rows 10–12px, tiles 30% of size, buttons/badges/segmented are capsules.
- Icons: `lucide-react` only, 16px (`size-4`), `strokeWidth={1.9}`; 14px inside badges and small rows.
- Empty states: `EmptyState` with an icon (it draws a dashed ring around a mint disc). Make them specific and useful, with the next action.
- Loading: `Skeleton` at the content's real geometry.
- Motion: subtle. `animate-rise` on the page root, `motion` (from `motion/react`) for layout and presence, 150–250ms, `ease-out-soft`. Nothing bounces, nothing loops except live status dots.
- Copy: plain, specific, sentence case, no exclamation marks, no "AI-powered". Say what happens to the money.

## Hard rules from CLAUDE.md

- No money moves without a receipt; limits are enforced in code; money is integer cents (`formatCents`, `<Amount>`).
- Don't change backend behaviour, Convex queries or mutations while restyling. UI only, unless a query is missing data a design needs (then add a field at the end of the surface's schema section and say so).
- Outside `(app)` never call `Date.now()`, `Math.random()` or `new Date()` during render.
