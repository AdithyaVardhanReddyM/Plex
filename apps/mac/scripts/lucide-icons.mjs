// Builds Assets.xcassets/Lucide from scripts/lucide-icons.txt: one template vector image per icon,
// named `lucide-<name>`, drawn from the lucide-react the web app uses (so both apps share one set,
// at the web's stroke width). Run from apps/mac after adding a name to the list:
//
//   node scripts/lucide-icons.mjs
//
// Lucide is ISC-licensed (https://lucide.dev/license).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const mac = path.resolve(here, "..");
const icons = path.resolve(mac, "../web/node_modules/lucide-react/dist/esm/icons");
const out = path.join(mac, "Resources/Assets.xcassets/Lucide");
const STROKE = 1.9; // the web's strokeWidth

const names = fs
  .readFileSync(path.join(here, "lucide-icons.txt"), "utf8")
  .split("\n")
  .map((s) => s.trim())
  .filter((s) => s && !s.startsWith("#"));

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, "Contents.json"), JSON.stringify({ info: { author: "xcode", version: 1 } }, null, 2));

const escape = (v) => String(v).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
let missing = [];
for (const name of [...new Set(names)].sort()) {
  let file = path.join(icons, `${name}.mjs`);
  if (!fs.existsSync(file)) {
    missing.push(name);
    continue;
  }
  // Renamed icons are re-exports of their new name ("home" → "house"): follow them.
  const alias = fs.readFileSync(file, "utf8").match(/export \{ default \} from '\.\/(.+?)\.mjs'/);
  if (alias) file = path.join(icons, `${alias[1]}.mjs`);
  const { __iconData } = await import(pathToFileURL(file).href);
  const body = __iconData.node
    .map(([tag, attrs]) => {
      const a = Object.entries(attrs)
        .filter(([k]) => k !== "key")
        .map(([k, v]) => `${k}="${escape(v)}"`)
        .join(" ");
      return `<${tag} ${a}/>`;
    })
    .join("");
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" ` +
    `stroke="#000" stroke-width="${STROKE}" stroke-linecap="round" stroke-linejoin="round">${body}</svg>\n`;
  const set = path.join(out, `lucide-${name}.imageset`);
  fs.mkdirSync(set);
  fs.writeFileSync(path.join(set, `${name}.svg`), svg);
  fs.writeFileSync(
    path.join(set, "Contents.json"),
    JSON.stringify(
      {
        images: [{ filename: `${name}.svg`, idiom: "universal" }],
        info: { author: "xcode", version: 1 },
        properties: { "preserves-vector-representation": true, "template-rendering-intent": "template" },
      },
      null,
      2,
    ),
  );
}
console.log(`${names.length - missing.length} icons written to ${path.relative(mac, out)}`);
if (missing.length) {
  console.error(`Not in Lucide: ${missing.join(", ")}`);
  process.exit(1);
}
