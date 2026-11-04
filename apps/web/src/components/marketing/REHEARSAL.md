# Rehearsal: landing hero and bento

Built with the Stageshow skill (`~/.claude/skills/stageshow`). The kit is
vendored in `stage/kit/` (lint-ignored, unedited).

## Hero: `hero-demo.tsx`

Gold: `payout-flow` (cursorless story, a panel that slides aside as a
satellite arrives, a connector, a note that lands). Kept its stage size
(640 × 420), 40px gutter, timing curves, the slide-aside and the staggered
satellite. Changed the content to Plex: the Plex for Mac panel (Adi's words,
three steps) and a Receipt card with the foil edge, in Plex's tokens.

Beats, played once as it scrolls into view (about 12s), with Replay:

1. Adi's request is on screen from the first frame.
2. Found the usual order at Kettle Corner, $18.40.
3. Checking the Food pot, then "Food: up to $40 a day" and Allowed; the
   gauge fills from $13 to $31.40 of $40.
4. Paying with PayPal. The panel slides aside and the Receipt arrives
   (Pending, Authorizing).
5. Payoff: Paid. Both sides settle together: the step ticks, the Receipt
   turns Paid with the capture id, the connector draws, and "Filed to your
   Ledger" lands. That frame is the poster (reduced motion, thumbnails).

Compact (below 600px): 358 × 640, the Receipt lands under the run with a
vertical connector; type stays at design size.

## Bento: `bento.tsx`, `bento-pictures.tsx`

Planned with `references/bento.md`:

| Tile | Span | Kind | The one thing |
|---|---|---|---|
| Plex Tasks | 2/3 | Hero UI (one component) | Proof checks pass; the payout card straddles the task |
| Plex for Mac | 1/3 | Statement | "Never buy subscriptions without asking." becomes `block_category` |
| Plex Causes | 1/3 | Stat | $45 pays one cleanup shift, on proof |
| Plex Ledger | 2/3 | Diagram | Spent by pot, under Adi's question |

Two UI pictures out of four, kinds alternating across both rows, no window
chrome, and no string shared with the hero. The two pictures are static
Stages at the tile's real width (748; `fill` only if a tile is wider) with a
358 compact design.

## Gate

Filmed in the Stageshow playground from the same code (`examples/plex-hero`
and `examples/plex-bento`, copied from this folder by a sync script with only
the import paths changed):

- Hero, full timeline, `--gate` at 1280 and at 390: `rehearsal passed`
  (coverage marked inconclusive only for frame-sampling gaps under load).
- Hero `--states --gate` at 1280 and 390: `rehearsal passed`.
- Hero `--reduced --still --gate` (the poster) at both widths: passed.
- Bento `--still --gate` at 1280 (in a 748px slot, as on the page) and 390:
  passed.

On the real page (`http://localhost:3004/`), the same films show no faults
except `kit override` lines that name the kit's own rules (`.ss-avatar`,
`.ss-check__fill`). film.mjs recognizes kit CSS by a stylesheet URL containing
`/kit/`; Next merges every stylesheet into hashed chunks, so the kit's rules
look like page CSS. No file here styles a kit part. That is why the
authoritative gate runs in the playground.

Fixed during rehearsal: a window narrower than tall (now a notch panel, not
a window), an empty band before the steps arrived (steps now open with
`Collapse`), loose title stacks, Swap exits with no fade (now `States`), Roll
settle snaps, transform landings, half-pixel icons (icons in even boxes),
uneven gutters on the Tasks satellite, a sliver bleed and a void on the
Ledger at 390, and a payout card that covered real check labels at 390.

## Exporting stills and footage (Devpost, video)

From `~/.claude/skills/stageshow`, with the app on :3004 (or the playground
on :5199 and the sync script run):

```sh
# The hero poster, a clean 2x still
node scripts/film.mjs "http://localhost:3004/" --select ".ph" --reduced --still --out hero.png
# The hero's story as a contact sheet, one frame a second
node scripts/film.mjs "http://localhost:3004/" --select ".ph" --every 1000 --count 13 --out hero-sheet.png
# Phone versions
node scripts/film.mjs "http://localhost:3004/" --select ".ph" --width 390 --reduced --still --out hero-390.png
# Bento pictures
node scripts/film.mjs "http://localhost:3004/" --select ".pb-tasks" --still --out bento-tasks.png
node scripts/film.mjs "http://localhost:3004/" --select ".pb-ledger" --still --out bento-ledger.png
```

For video footage, screen-record the page at 1440 wide and press Replay
under the hero; it plays the 12-second story from the start each time.

## Not checked

- Real-device touch and Safari; frames were Chromium only.
- Live frame pacing on a slow machine (the virtual clock proves geometry).
- The Mac and Causes tiles are page type, not stages, so film does not
  judge them; they were checked by eye at 1440 and 390.
