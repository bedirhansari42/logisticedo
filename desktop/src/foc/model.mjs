/* Ücretsiz sevkiyat yardımcıları (saf; node --test ile denenir). Neden kuralı motorda, burada yeniden dışa aktarılır. */
export { FOC_REASONS, focReasonText } from "../../../assets/js/app/foc.js";

/** Belge gruplarını sevkiyat türüne göre süzer: ücretsizse "ci" yerine "foc", değilse "foc" gizli. Girdiyi değiştirmez. */
export function docGroupsFor(groups, enabled) {
  const hide = enabled ? "ci" : "foc";
  return groups.map((g) => ({ ...g, docs: g.docs.filter((d) => d !== hide) }));
}
