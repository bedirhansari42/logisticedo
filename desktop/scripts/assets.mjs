// Web sitesindeki yerel kütüphaneleri (vendor/) ve PDF yazı tiplerini public/ altına kopyalar.
// Vite bunları olduğu gibi yayınlar; motor (loader.js) çalışma anında buradan yükler.
import { cp, rm, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const site = path.resolve(here, "../..");
const pub = path.resolve(here, "../public");

await rm(path.join(pub, "vendor"), { recursive: true, force: true });
await rm(path.join(pub, "assets"), { recursive: true, force: true });
await mkdir(path.join(pub, "assets"), { recursive: true });
const skip = (p) => !p.endsWith(".DS_Store");
await cp(path.join(site, "vendor"), path.join(pub, "vendor"), { recursive: true, filter: skip });
await cp(path.join(site, "assets/fonts"), path.join(pub, "assets/fonts"), { recursive: true, filter: skip });
await cp(path.join(site, "assets/img/favicon.png"), path.join(pub, "favicon.png"));
console.log("assets tamam → public/");
