# Plex web: design system

The app is judged on design. It must look bold and crafted, never like a stock dashboard: a dark ink frame, borderless surfaces with real depth, huge display type, and money shown as objects (a lit night "spotlight" card, a brushed-metal card for held money, tinted card faces). Mercury, Ramp and Linear are the bar for craft; Home (`app/(app)/home/home-view.tsx`) is the reference for this look.

## The owner's rules (non-negotiable)

1. Icons stand alone: no tile, circle, square or chip behind an icon. `IconTile` now renders a bare icon; never hand-build an icon container. Icons are 18–20px in rows and cards, bigger in heroes.
2. No header strips inside cards (a tinted band with a bottom border), and as few separator lines as possible: no `divide-y` lists, no `border-t`/`border-b` rules between sections of a card, no divided stat strips. Group with space, type size and surface instead. A list is rows with generous padding and a hover fill.
3. No dots: no status dots in pills, no pulsing lights, no dotted pills, no dot grids. Say status in words and color.
4. Never use Lucide's `Bot` icon (use `Cpu`, or the agent's own avatar).
5. People get DiceBear faces (`Avatar` does it for round avatars); agents, brands and orgs use `Avatar square` with initials.

## Signature surfaces

- `.spotlight` (globals.css): a dark night card with mint/aqua light. One per screen, for the screen's key number or object (Home: the week). White text, `font-display` figures 48–68px, glass chips (`bg-white/[0.08] shadow-[inset_0_0_0_1px_rgb(255_255_255/0.08)]`).
- `.metal-card`: brushed steel with a sheen, for money that's held by PayPal. Steel-900 text, big display figure.
- Tinted card faces: `bg-[linear-gradient(150deg,var(--color-green-50),var(--color-green-100)_70%,var(--color-green-200))]` (or the steel equivalent) for objects like pots and causes: big figure, ink progress bar on `bg-white/60`.
- Plain cards: `Card` (no border, layered shadow, 18px radius). Titles in `font-display` 16px bold via `CardHeader`.

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
- `IconTile` (tones `neutral | mint | steel | ink | white | amber | red`, sizes `xs | sm | md | lg`): a bare, toned icon (no container).
- `Badge` (tones `neutral | green | steel | amber | red | outline | ink`). `StatusDot` is retired and renders nothing; remove it where you see it.
- `Segmented` (tabs and filters with a sliding white pill; `count` per item). Replace every hand-built tab row and pill filter with it.
- `Meter` (brand/steel gradient bar), `Stat` (label, value, foot), `Switch`, `Avatar` (`square` for agents, orgs, brands), `Input`, `Textarea`, `Label`, `Kbd`, `Skeleton`, `EmptyState` (`icon` or `art`).
- `Button` / `buttonVariants` (capsules): `primary` ink for the main action, `brand` mint only when money moves (fund, approve, release, donate), `secondary`, `ghost`, `danger`. Sizes `sm | md | lg | icon | icon-sm`.
- From `@/components/ui/viz`: `Ring` (progress ring), `DayBars` (daily columns), `Sparkline`.
- From `@/components/receipt/receipt`: `ReceiptCard`, `ReceiptRow`, `ReceiptKindIcon`, `StatePill`.

## Composition rules

- One focal object per screen: the thing the screen is about gets the size, the weight, the brand color. Everything else is quiet.
- Hierarchy from proportion, space and type weight, not from more boxes or lines. Inside a card, sub-blocks are soft wells (`rounded-[14px] bg-canvas/70`), never outlined boxes with header strips.
- Lists: rows with `rounded-[12px] px-3 py-3 hover:bg-sunken/70`, a bare 20px icon or an avatar, title 13.5–14px medium, meta 12px muted, value and status right-aligned, no lines between rows. Rows share one grid template so columns line up.
- Stats: big display figures with a small label, laid out with space (a grid with `gap-x-8 gap-y-6`), never ruled cells.
- Spacing scale: 4, 8, 12, 16, 20, 24, 32. Cards are 16px apart (`gap-4`). Card padding 20px (`p-5`); dense card bodies 16px.
- Radii: cards 14px (`rounded-lg`), sub-blocks and rows 10–12px, tiles 30% of size, buttons/badges/segmented are capsules.
- Icons: `lucide-react` only, 16px (`size-4`), `strokeWidth={1.9}`; 14px inside badges and small rows.
- Empty states: `EmptyState` with a bare icon or `art`. Make them specific and useful, with the next action.
- Loading: `Skeleton` at the content's real geometry.
- Motion: subtle. `animate-rise` on the page root, `motion` (from `motion/react`) for layout and presence, 150–250ms, `ease-out-soft`. Nothing bounces, nothing loops.
- Copy: plain, specific, sentence case, no exclamation marks, no "AI-powered". Say what happens to the money.

## Hard rules from CLAUDE.md

- No money moves without a receipt; limits are enforced in code; money is integer cents (`formatCents`, `<Amount>`).
- Don't change backend behaviour, Convex queries or mutations while restyling. UI only, unless a query is missing data a design needs (then add a field at the end of the surface's schema section and say so).
- Outside `(app)` never call `Date.now()`, `Math.random()` or `new Date()` during render.
