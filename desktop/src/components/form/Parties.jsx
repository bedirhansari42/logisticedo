import { useT } from "../../lib/i18n.js";
import { getPath } from "../../lib/shipment-state.js";
import { PlainField, setField } from "./Field.jsx";

function Party({ ctx, prefix, legendKey, taxId = true, person = false, toggle }) {
  const t = useT();
  const shown = toggle ? (toggle.invert ? !getPath(ctx.state, toggle.bind) : !!getPath(ctx.state, toggle.bind)) : true;
  return (
    <fieldset className="party">
      <legend>{t(legendKey)}</legend>
      {toggle && (
        <label className="check">
          <input type="checkbox" checked={!!getPath(ctx.state, toggle.bind)} onChange={(e) => setField(ctx, toggle.bind, e.target.checked)} />
          <span>{t(toggle.labelKey)}</span>
        </label>
      )}
      {shown && (
        <div className="party-fields">
          <PlainField ctx={ctx} bind={`${prefix}.name`} labelKey="f.name" />
          <PlainField ctx={ctx} bind={`${prefix}.address`} labelKey="f.address" textarea rows={3} />
          {person && <PlainField ctx={ctx} bind={`${prefix}.person`} labelKey="f.person" />}
          {taxId ? (
            <div className="fgrid fgrid--2">
              <PlainField ctx={ctx} bind={`${prefix}.taxId`} labelKey="f.taxId" />
              <PlainField ctx={ctx} bind={`${prefix}.contact`} labelKey="f.contact" />
            </div>
          ) : <PlainField ctx={ctx} bind={`${prefix}.contact`} labelKey="f.contact" />}
        </div>
      )}
    </fieldset>
  );
}

export function Parties({ ctx }) {
  return (
    <>
      <div className="party-grid">
        <Party ctx={ctx} prefix="seller" legendKey="f.seller" />
        <Party ctx={ctx} prefix="buyer" legendKey="f.buyer" person />
      </div>
      <div className="party-grid">
        <Party ctx={ctx} prefix="consignee" legendKey="f.consignee" toggle={{ bind: "consignee.same", labelKey: "f.sameAsBuyer", invert: true }} />
        <Party ctx={ctx} prefix="notify" legendKey="f.notify" taxId={false} person toggle={{ bind: "notify.enabled", labelKey: "f.addNotify" }} />
      </div>
    </>
  );
}
