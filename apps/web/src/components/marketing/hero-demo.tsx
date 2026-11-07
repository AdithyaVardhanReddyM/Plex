"use client";

// Import each kit part from its own module: the kit's index pulls in every
// stylesheet (phones, keyboards), which Next would bundle into this page.
import { Stage } from './stage/kit/stage'
import type { Act } from './stage/kit/act'
import { Bar } from './stage/kit/window'
import { Avatar } from './stage/kit/parts/Avatar'
import { Check } from './stage/kit/parts/Check'
import { Collapse } from './stage/kit/motion/Collapse'
import { Connector } from './stage/kit/motion/Connector'
import { States } from './stage/kit/motion/States'
import { useHydrated } from '@/components/client-only'
import { useState } from 'react'
import { Bot, ClipboardCheck, RotateCcw, ShieldCheck } from 'lucide-react'
import './hero-demo.css'

// Plex's landing hero (built and filmed in the Stageshow playground as
// examples/plex-hero; see REHEARSAL.md beside this file): an agent hires
// someone inside a limit, PayPal holds the money, and the hold comes with a
// Receipt. Cursorless, played once as it scrolls into view (after
// payout-flow): the agent run works through three steps, then slides aside
// as the Receipt arrives carrying the user's words, the rule and PayPal's id.

type S = { step: number; held: boolean }
const START: S = { step: 0, held: false }
const POSTER: S = { step: 7, held: true }

const WHY = 'Find someone to photograph the menu at Kettle Corner today.'

const script = async (a: Act<S>) => {
  await a.wait(700)
  a.mark('found')
  a.put({ step: 1 }) // the task is posted
  await a.wait(1300)
  a.mark('rule')
  a.put({ step: 2 }) // checking the Errands rule
  await a.wait(1100)
  a.put({ step: 3 }) // inside the limit: allowed
  await a.wait(1300)
  a.mark('pay')
  a.put({ step: 4 }) // holding with PayPal
  await a.wait(900)
  a.mark('receipt')
  a.put({ step: 5 }) // the run slides aside, the Receipt arrives
  await a.wait(1500)
  a.mark('held')
  a.put({ held: true, step: 6 }) // authorized: both sides settle, the line draws
  await a.wait(1400)
  a.put({ step: 7 }) // the note lands
}

export function HeroDemo() {
  return (
    <Stage<S>
      width={640}
      height={420}
      compact={{ below: 600, width: 358, height: 664 }}
      initial={START}
      poster={POSTER}
      play="once"
      script={script}
      className="ph"
    >
      {(s, rect, layout) => {
        const compact = layout === 'compact'
        const row = rect('pay-row')
        const card = rect('receipt')
        return (
          <>
            <div className="ph-wash" />

            {/* The agent's run, as Plex sees it: an agent over MCP, not a full window */}
            <section className="ph-run" data-aside={s.step >= 5 || undefined}>
              <div className="ph-run__head">
                <span className="ph-run__icon">
                  <Bot size={14} strokeWidth={1.9} />
                </span>
                <span className="ph-run__name">Claude</span>
                <span className="ph-run__via">via Plex MCP</span>
                <span className="ph-run__status" data-done={s.held || undefined}>
                  <States align="end" value={s.held ? 'done' : 'working'} states={{ working: 'Working', done: 'Done' }} />
                </span>
              </div>
              <div className="ph-run__body">
                <div className="ph-ask">
                  <Avatar name="Adi Reddy" tone="accent" size={24} className="ph-ask__avatar" />
                  <div className="ph-ask__text">
                    <div className="ph-ask__who">Adi asked</div>
                    <div className="ph-ask__words">{WHY}</div>
                  </div>
                </div>

                <ol className="ph-steps">
                  <Collapse open={s.step >= 1} reveal="drop">
                  <li className="ph-step">
                    <Check on={s.step >= 1} size={16} />
                    <div className="ph-step__main">
                      <div className="ph-step__title">Posted a task</div>
                      <div className="ph-step__sub">Menu and storefront photos, by 6pm</div>
                    </div>
                    <span className="ph-step__meta">$18</span>
                  </li>
                  </Collapse>

                  <Collapse open={s.step >= 2} reveal="drop">
                  <li className="ph-step">
                    <Check on={s.step >= 3} pending={s.step === 2} size={16} />
                    <div className="ph-step__main">
                      <div className="ph-step__title">
                        <States align="start" value={s.step >= 3 ? 'ok' : 'checking'} states={{ checking: 'Checking the Errands pot', ok: 'Errands: $50 per task' }} />
                      </div>
                      <div className="ph-step__sub">
                        <States align="start" value={s.step >= 3 ? 'after' : 'before'} states={{ before: '$63 of $200 this month', after: '$81 of $200 this month' }} />
                      </div>
                      <span className="ph-gauge">
                        <span className="ph-gauge__fill" style={{ width: s.step >= 3 ? '40.5%' : '31.5%' }} />
                      </span>
                    </div>
                    <span className="ph-allowed" data-in={s.step >= 3 || undefined}>
                      <span className="ph-ico ph-ico--12">
                        <ShieldCheck size={12} strokeWidth={2.2} />
                      </span>
                      Allowed
                    </span>
                  </li>
                  </Collapse>

                  <Collapse open={s.step >= 4} reveal="drop">
                  <li className="ph-step" data-target="pay-row">
                    <Check on={s.held} pending={s.step >= 4 && !s.held} size={16} />
                    <div className="ph-step__main">
                      <div className="ph-step__title">
                        <States align="start" value={s.held ? 'held' : 'holding'} states={{ holding: 'Holding with PayPal', held: 'Held with PayPal' }} />
                      </div>
                      <div className="ph-step__sub ph-mono" data-in={s.held || undefined}>
                        Authorization 3KF05293L7
                      </div>
                    </div>
                    <span className="ph-step__meta">$18</span>
                  </li>
                  </Collapse>
                </ol>

                {/* What runs on below the crop: earlier runs, quiet */}
                <div className="ph-later" data-crop>
                  {[64, 48, 56, 44, 60, 52, 40, 58, 46, 62, 50, 42, 54, 48].map((w, i) => (
                    <div key={i} className="ph-later__row">
                      <Bar w={14} h={14} r={7} tone={2} />
                      <Bar w={`${w}%`} h={6} tone={2} />
                      <Bar w={34} h={6} tone={2} />
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {/* The Receipt: arrives with the hold, carrying the why, the rule and PayPal's id */}
            <section className="ph-receipt" data-target="receipt" data-in={s.step >= 5 || undefined}>
              <div className="ph-foil" />
              <div className="ph-receipt__in">
                <div className="ph-receipt__head" style={{ ['--i' as string]: 0 }}>
                  <span className="ph-receipt__kind">
                    <span className="ph-ico ph-ico--14">
                      <ClipboardCheck size={14} strokeWidth={1.9} />
                    </span>
                    Receipt
                  </span>
                  <span className="ph-state" data-held={s.held || undefined}>
                    <States value={s.held ? 'held' : 'pending'} states={{ pending: 'Pending', held: 'Held' }} />
                  </span>
                </div>
                <div className="ph-receipt__payee" style={{ ['--i' as string]: 1 }}>
                  <span>Menu photos</span>
                  <span className="ph-amount">
                    <span className="ph-amount__sign">−</span>$18
                  </span>
                </div>
                <dl className="ph-lines" style={{ ['--i' as string]: 2 }}>
                  <div className="ph-line">
                    <dt>Why</dt>
                    <dd>“{WHY}”</dd>
                  </div>
                  <div className="ph-line">
                    <dt>Allowed by your rule</dt>
                    <dd>Errands: up to $50 per task</dd>
                  </div>
                  <div className="ph-line">
                    <dt>PayPal</dt>
                    <dd className="ph-mono">
                      <States align="start" value={s.held ? 'held' : 'auth'} states={{ auth: 'Authorizing', held: 'Authorized · 3KF05293L7' }} />
                    </dd>
                  </div>
                </dl>
              </div>
            </section>

            {row.width > 0 && card.width > 0 && (
              <Connector
                show={s.step >= 6}
                from={compact ? { x: row.x + 30, y: row.y + row.height + 4 } : { x: row.x + row.width + 6, y: row.y + row.height / 2 }}
                to={compact ? { x: row.x + 30, y: card.y } : { x: card.x, y: row.y + row.height / 2 }}
                route={compact ? 'v' : 'straight'}
                className="ph-link"
              />
            )}

            <div className="ph-note" data-in={s.step >= 7 || undefined} style={{ left: card.x, top: card.y + card.height + 14 }}>
              Paid out only when the proof passes
            </div>
          </>
        )
      }}
    </Stage>
  )
}

/** The hero plays once as it scrolls in; Replay remounts it at the story's start. */
export function HeroWithReplay() {
  const [run, setRun] = useState(0)
  // Client only: the stage measures itself, so a server render buys nothing
  const hydrated = useHydrated()
  return (
    <div className="flex flex-col items-end gap-2">
      <div className="w-full">
        {hydrated ? <HeroDemo key={run} /> : <div className="aspect-[640/420] w-full rounded-[18px] bg-sunken" />}
      </div>
      <button
        type="button"
        onClick={() => setRun((n) => n + 1)}
        className="inline-flex h-8 items-center gap-1.5 rounded-sm px-2.5 text-[13px] font-medium text-muted transition-colors hover:bg-sunken hover:text-ink"
      >
        <RotateCcw className="size-3.5" strokeWidth={1.9} />
        Replay
      </button>
    </div>
  )
}
