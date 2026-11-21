/* Excel hücresine yazılacak değer. Durum verisi (kullanıcı girdisi, içe aktarılan dosya, geri yüklenen yedek) hücreye
   yalnızca düz değer olarak girer. ExcelJS nesne değerlerini formül/köprü/zengin metin hücresi sayar; bu yüzden formülü
   yalnızca oluşturucunun kendi ürettiği formula() nesnesi taşıyabilir. JSON'dan gelen nesne bu işareti taşıyamaz. */

const FORMULA = Symbol("lgx.formula");

/** Oluşturucunun kendi formülü: put(ws, ref, formula("SUM(A1:A3)", 6)) */
export const formula = (f, result) => ({ [FORMULA]: true, formula: f, result });

export function cellValue(v) {
  if (v == null || typeof v === "string" || typeof v === "number" || typeof v === "boolean") return v;
  if (typeof v === "object" && v[FORMULA] === true) return { formula: v.formula, result: v.result };
  return String(v);
}
