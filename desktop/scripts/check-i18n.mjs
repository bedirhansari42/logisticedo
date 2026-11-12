// Kodda ve form şemasında kullanılan tüm çeviri anahtarlarının TR ve EN'de bulunduğunu doğrular.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const site = path.resolve(root, "..");
globalThis.localStorage = { getItem: () => null, setItem() {} };
globalThis.document = { querySelectorAll: () => [], documentElement: { dataset: {} }, title: "" };
const i18n = await import(pathToFileURL(path.join(site, "assets/js/i18n.js")).href);
const { EXTRA } = await import(pathToFileURL(path.join(root, "src/lib/strings.js")).href);

const has = (lang, k) => {
  if (EXTRA[lang][k] != null) return true;
  i18n.setLang(lang);
  return i18n.t(k) !== k;
};

const keys = new Set();
const walk = (dir) => {
  for (const f of readdirSync(dir)) {
    const p = path.join(dir, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(jsx?|json)$/.test(f) && !p.endsWith("strings.js")) {
      const src = readFileSync(p, "utf8");
      for (const m of src.matchAll(/\bt\(\s*"([\w.]+)"/g)) keys.add(m[1]);
      for (const m of src.matchAll(/(?:labelKey|titleKey|hintKey|placeholderKey)["']?\s*[:=]\s*"([\w.]+)"/g)) keys.add(m[1]);
      for (const m of src.matchAll(/\[\s*"[\w.]+",\s*"([a-z]+\.[\w.]+)"/g)) keys.add(m[1]); // sütun tanımları
    }
  }
};
walk(path.join(root, "src"));

const docs = ["ci", "pl", "pallet", "contract", "bill", "si", "bl", "prealert", "cmr", "labels", "loading", "trans", "ins", "origin", "coo", "eur1", "poa"];
docs.forEach((d) => keys.add(`pv.${d}`));
["draft", "ready", "transit", "delivered"].forEach((s) => keys.add(`d.status.${s}`));
["general", "items", "bank"].forEach((s) => keys.add(`d.step.${s}`));
["ready", "partial", "empty"].forEach((s) => keys.add(`d.ds.${s}`));
["miss.invoiceNo", "miss.seller", "miss.buyer", "miss.items", "miss.currency", "f.none", "tm.sea", "tm.air", "tm.road", "tm.rail", "tm.multi", "tm.courier"].forEach((k) => keys.add(k));

const schema = JSON.parse(readFileSync(path.join(root, "src/lib/form-schema.json"), "utf8"));
for (const s of schema.sections) {
  if (s.titleKey) keys.add(s.titleKey);
  for (const n of s.nodes) {
    for (const k of ["labelKey", "hintKey", "placeholderKey"]) if (n[k]) keys.add(n[k]);
    for (const o of n.options || []) if (o.labelKey) keys.add(o.labelKey);
  }
}

keys.delete("packing.packageType"); // veri yolu, çeviri anahtarı değil
let bad = 0;
for (const k of [...keys].sort()) {
  for (const lang of ["tr", "en"]) if (!has(lang, k)) { console.log(`EKSİK [${lang}] ${k}`); bad++; }
}
console.log(`${keys.size} anahtar denetlendi, ${bad} eksik.`);
process.exit(bad ? 1 : 0);
