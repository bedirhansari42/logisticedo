/* Zorunlu alan uyarısı: bir adımda en az bir belgenin istediği alanlar boşsa adımın başında çıkar.
   Metinler kurallardan gelir (requirements/model.mjs); yeni kural eklendiğinde bileşen değişmez. */
import { useT } from "../../lib/i18n.js";
import { RULES, docsForRule } from "../../requirements/model.mjs";
import { Icon } from "../Icons.jsx";

/** İndirme türünün kullanıcıya görünen adı */
export const docLabel = (t, kind) => (kind === "xlsx" ? t("pv.dlXlsx") : t(`pv.${kind}`));

export function RequirementNotice({ gaps, onGo }) {
  const t = useT();
  if (!gaps.length) return null;
  return (
    <div className="banner req-notice" role="status">
      <Icon name="warn" />
      <div className="req-text">
        <strong>{t("d.req.title")}</strong>
        {gaps.map((g) => (
          <p key={g.rule}>{t(RULES[g.rule].msgKey, { n: g.ids.length, docs: docsForRule(g.rule).map((k) => docLabel(t, k)).join(", ") })}</p>
        ))}
      </div>
      <button type="button" className="btn btn--ghost btn--sm" onClick={() => onGo(gaps[0])}>{t("d.req.go")}</button>
    </div>
  );
}
