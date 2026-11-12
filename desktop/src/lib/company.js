/* Şirketler (ihracatçı ve alt şirketleri) ve banka hesapları. Kayıt: IndexedDB kv "companies" altında tek liste.
   Banka hesapları şirketin içinde durur; belge para birimine uyan hesap sevkiyata yazılır. */
import { uid } from "@engine/doc-model.js";

export const newBank = (currency = "") => ({ id: uid(), currency, bankName: "", branch: "", accountName: "", iban: "", swift: "", accountNo: "", isDefault: false });

export const newCompany = () => ({
  id: uid(), name: "", address: "", taxId: "", contact: "",
  signName: "", signTitle: "", signPlace: "", lhId: "", banks: [], updatedAt: Date.now()
});

const norm = (v) => String(v ?? "").trim().toUpperCase();

/** Belge para birimine uyan hesap: varsayılan işaretli olan, yoksa ilki. Uyan hesap yoksa null (yanlış para birimli hesap yazılmaz). */
export function pickBank(company, currency) {
  const cur = norm(currency);
  if (!company || !cur) return null;
  const same = (company.banks || []).filter((b) => norm(b.currency) === cur);
  return same.find((b) => b.isDefault) || same[0] || null;
}

export const bankToState = (b) => ({ bankName: b.bankName || "", branch: b.branch || "", accountName: b.accountName || "", iban: b.iban || "", swift: b.swift || "", accountNo: b.accountNo || "" });

export const bankLabel = (b) => [norm(b.currency), b.bankName, b.iban ? `…${String(b.iban).replace(/\s+/g, "").slice(-4)}` : ""].filter(Boolean).join(" · ");

/** Şirketin satıcı, imza ve (varsa) banka bilgisini sevkiyat durumuna yazar. Eski değerlerin üzerine yazar. */
export function applyCompanyToState(state, company, bank) {
  state.seller = { ...state.seller, name: company.name || "", address: company.address || "", taxId: company.taxId || "", contact: company.contact || "" };
  state.sign = { ...state.sign, name: company.signName || "", title: company.signTitle || "", place: company.signPlace || "" };
  if (bank) state.bank = { ...state.bank, ...bankToState(bank) };
}

/** Yeni sevkiyat için, antet profili biçiminde (freshState / applyParsed `profile`): satıcı, imza, para birimine uyan banka */
export function companyProfile(company, currency) {
  if (!company) return null;
  const bank = pickBank(company, currency);
  return {
    seller: { name: company.name || "", address: company.address || "", taxId: company.taxId || "", contact: company.contact || "" },
    sign: { name: company.signName || "", title: company.signTitle || "", place: company.signPlace || "" },
    ...(bank ? { bank: bankToState(bank) } : {})
  };
}
