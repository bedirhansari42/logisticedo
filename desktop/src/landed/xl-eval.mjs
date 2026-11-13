/* YALNIZCA TEST İÇİN: ExcelJS çalışma kitabındaki formülleri yeniden hesaplar (önbellekteki `result` kullanılmaz).
   Desteklenen: + - * / ( ), karşılaştırmalar, ROUND SUM IF MAX MIN AND OR ABS, "Sayfa!A1" ve "A1:B2" aralıkları. */

import { colName } from "./xlsx.mjs";
export { colName };
const colNum = (s) => [...s].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);

/** Üretimdeki round()'dan bağımsız (BigInt ile ondalık dizgi üzerinden) yarım yukarı yuvarlama. */
export function roundDecimal(x, d = 0) {
  if (!Number.isFinite(x)) return x;
  const [mant, exp = "0"] = Math.abs(x).toPrecision(15).split("e");
  const [ip, fp = ""] = mant.split(".");
  const digits = BigInt(ip + fp);
  const shift = d - (fp.length - Number(exp)); // değer = digits / 10^(fp.length - exp); hedef: digits * 10^shift
  let n;
  if (shift >= 0) n = digits * 10n ** BigInt(shift);
  else { const div = 10n ** BigInt(-shift); n = digits / div; if ((digits % div) * 2n >= div) n += 1n; }
  const out = Number(n) / 10 ** d;
  return x < 0 && out !== 0 ? -out : out;
}

const flat = (a) => a.flat(Infinity);
const nums = (a) => flat(a).filter((v) => typeof v === "number");
const FNS = {
  ROUND: roundDecimal,
  SUM: (...a) => nums(a).reduce((s, v) => s + v, 0),
  IF: (c, a, b = false) => (c ? a : b),
  MAX: (...a) => Math.max(...nums(a)),
  MIN: (...a) => Math.min(...nums(a)),
  AND: (...a) => flat(a).every(Boolean),
  OR: (...a) => flat(a).some(Boolean),
  ABS: Math.abs
};

const REF = /(?:(\w+)!)?\$?([A-Z]{1,3})\$?(\d+)(?::\$?([A-Z]{1,3})\$?(\d+))?/g;

export function evalWorkbook(wb) {
  const memo = new Map();

  const value = (sheet, ref) => {
    const key = `${sheet}!${ref.replace(/\$/g, "")}`;
    if (memo.has(key)) return memo.get(key);
    const ws = wb.getWorksheet(sheet);
    if (!ws) throw new Error(`no sheet ${sheet}`);
    const v = ws.getCell(ref.replace(/\$/g, "")).value;
    const out = v && typeof v === "object" && "formula" in v ? run(v.formula, sheet) : (v ?? 0);
    memo.set(key, out);
    return out;
  };

  const range = (sheet, from, to) => {
    const [, c1, r1] = from.match(/([A-Z]+)(\d+)/), [, c2, r2] = to.match(/([A-Z]+)(\d+)/);
    const out = [];
    for (let r = +r1; r <= +r2; r++) for (let c = colNum(c1); c <= colNum(c2); c++) out.push(value(sheet, `${colName(c)}${r}`));
    return out;
  };

  const run = (formula, sheet) => {
    const js = formula.replace(/^=/, "")
      .replace(REF, (_, sh, c1, r1, c2, r2) => {
        const s = JSON.stringify(sh || sheet);
        return c2 ? `RNG(${s},"${c1}${r1}","${c2}${r2}")` : `REF(${s},"${c1}${r1}")`;
      })
      .replace(/<>/g, "!==")
      .replace(/(?<![<>=!])=(?!=)/g, "===");
    return new Function("REF", "RNG", ...Object.keys(FNS), `return (${js});`)(value, range, ...Object.values(FNS));
  };

  return (sheet, ref) => value(sheet, ref);
}
