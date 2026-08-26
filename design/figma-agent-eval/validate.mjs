import fs from "node:fs";
import path from "node:path";

const base = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(.:)/, "$1"));
const read = (name) => fs.readFileSync(path.join(base, name), "utf8");
const manifest = JSON.parse(read("manifest.json"));
const inventory = JSON.parse(read("ui-inventory.json"));
const tokens = JSON.parse(read("tokens.json"));
const code = read("code.js");

const errors = [];
if (manifest.main !== "code.js") errors.push("manifest.main must be code.js");
if (!code.includes("createVariables()")) errors.push("variable generator missing");
if (!code.includes("combineAsVariants")) errors.push("component variants missing");
if (!tokens.color?.light?.primary || !tokens.color?.dark?.primary) errors.push("light/dark semantic colors missing");

const screens = inventory.pages.flatMap((page) => page.screens);
for (const screen of screens) {
  if (!code.includes(JSON.stringify(screen))) errors.push(`screen missing from generator: ${screen}`);
}
if (new Set(screens).size !== screens.length) errors.push("duplicate screen name in inventory");

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(JSON.stringify({
  plugin: manifest.name,
  figmaPages: inventory.pages.length + 3,
  editableScreens: screens.length,
  roles: inventory.meta.roles,
  themes: ["Light", "Dark"],
  componentSets: ["Button", "Badge", "Input"]
}, null, 2));
