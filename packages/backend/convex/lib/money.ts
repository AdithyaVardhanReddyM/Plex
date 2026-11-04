export function formatCents(cents: number, currency = "USD"): string {
  const whole = cents % 100 === 0;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

const WORDS = [
  "maple", "harbor", "cobalt", "lantern", "meadow", "copper", "falcon", "juniper",
  "pebble", "saffron", "willow", "orbit", "tundra", "velvet", "quartz", "ember",
];

/** A short random word the worker must show in one proof photo. */
export function challengeCode(seed = Math.random()): string {
  const word = WORDS[Math.floor(seed * WORDS.length) % WORDS.length];
  const n = Math.floor((seed * 997) % 90) + 10;
  return `${word}-${n}`;
}
