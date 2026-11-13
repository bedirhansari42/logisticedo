/* Türkiye ithalatı kuralları (ülke profili). Vergi oranları burada YOKTUR: oranlar kullanıcı girdisidir. */

/** freight/insurance: fatura fiyatı uluslararası navlunu/sigortayı zaten içeriyor mu (Incoterm varsayılanı).
 *  D terimlerinde (delivered) fiyat sınır sonrası taşımayı da içerir; o kısım "deduct" satırıyla düşülür. */
export const INCOTERMS = {
  EXW: { freight: false, insurance: false },
  FCA: { freight: false, insurance: false },
  FAS: { freight: false, insurance: false },
  FOB: { freight: false, insurance: false },
  CFR: { freight: true, insurance: false },
  CPT: { freight: true, insurance: false },
  CIF: { freight: true, insurance: true },
  CIP: { freight: true, insurance: true },
  DAP: { freight: true, insurance: false, delivered: true },
  DPU: { freight: true, insurance: false, delivered: true },
  DDP: { freight: true, insurance: false, delivered: true, dutyPaid: true }
};

export const defaultIncluded = (incoterm, kind) => !!INCOTERMS[incoterm]?.[kind];

export const ALLOC_KEYS = ["auto", "value", "weight", "volume", "qty"];
export const CURRENCIES = ["USD", "EUR", "GBP", "CNY", "TRY", "RUB", "AED", "SAR", "CHF", "JPY"]; // ayrıştırıcının tanıdığı para birimleri
export const DEFAULTS = { vatRate: 20, flatInsuranceRate: 3 };
