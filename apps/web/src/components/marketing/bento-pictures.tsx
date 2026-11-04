"use client";

import { Stage } from "./stage/kit/stage";
import { Bar } from "./stage/kit/window";
import { Avatar } from "./stage/kit/parts/Avatar";
import { Check } from "./stage/kit/parts/Check";
import "./bento.css";

// The two bento pictures, as static Stages so film.mjs can export them as
// stills. Kept free of app imports so the Stageshow playground can film the
// same code (see REHEARSAL.md).

// ── Tasks: one component, the proof checks and the payout ───────────────────

const CHECKS = [
  { label: "Storefront photo", detail: "sign readable" },
  { label: "Menu photo", detail: "prices legible" },
  { label: "Challenge code", detail: "cobalt-38 in frame" },
];

export function TasksPicture() {
  return (
    <Stage fill width={748} height={260} compact={{ below: 560, width: 358, height: 390 }} className="pb-tasks">
      {() => (
        <>
          <section className="pb-task">
            <div className="pb-task__head">
              <div className="pb-task__title">Photograph the menus of 3 taquerias on 24th St</div>
              <div className="pb-task__meta">Posted by Plex for Mac · Mission, SF</div>
            </div>
            <ul className="pb-checks">
              {CHECKS.map((c) => (
                <li key={c.label} className="pb-check">
                  <Check on size={16} />
                  <span className="pb-check__label">{c.label}</span>
                  <span className="pb-check__detail">{c.detail}</span>
                </li>
              ))}
              <li className="pb-check pb-check--filler" data-crop>
                <Bar w={16} h={16} r={8} tone={2} />
                <Bar w={120} h={6} tone={2} />
              </li>
            </ul>
          </section>

          <section className="pb-paid">
            <div className="pb-paid__verdict">Pass · 96% · 3 of 3 checks</div>
            <div className="pb-paid__who">
              <Avatar name="Maya Chen" size={28} />
              <div className="pb-paid__text">
                <div className="pb-paid__name">Maya Chen</div>
                <div className="pb-paid__sub">PayPal Payouts</div>
              </div>
              <span className="pb-paid__amount">$12</span>
            </div>
          </section>
        </>
      )}
    </Stage>
  );
}

// ── Ledger: where the month went ────────────────────────────────────────────

const POTS = [
  { name: "Food", spent: 385.5, budget: 600, tone: "green" },
  { name: "Shopping", spent: 84, budget: 400, tone: "steel" },
  { name: "Errands", spent: 63, budget: 200, tone: "green" },
  { name: "Giving", spent: 25.6, budget: 50, tone: "steel" },
];

export function LedgerPicture() {
  return (
    <Stage fill width={748} height={260} compact={{ below: 560, width: 358, height: 270 }} className="pb-ledger">
      {() => (
        <section className="pb-board">
          <div className="pb-board__ask">
            <span className="pb-board__q">Where did my money go this month?</span>
          </div>
          <div className="pb-board__title">
            <span>Spent by pot</span>
            <span className="pb-board__total">$558.10</span>
          </div>
          <ul className="pb-bars">
            {POTS.map((p) => (
              <li key={p.name} className="pb-bar">
                <span className="pb-bar__name">{p.name}</span>
                <span className="pb-bar__track">
                  <span
                    className="pb-bar__fill"
                    data-tone={p.tone}
                    style={{ width: `${Math.round((p.spent / 600) * 100)}%` }}
                  />
                </span>
                <span className="pb-bar__amount">
                  ${p.spent.toFixed(p.spent % 1 ? 2 : 0)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </Stage>
  );
}
