/* Uygulama temasıyla uyumlu onay penceresi (window.confirm yerine). askConfirm(...) → Promise<boolean>.
   Pencereyi <ConfirmHost /> çizer (App.jsx içinde bir kez). */
let current = null;
const listeners = new Set();
const emit = () => listeners.forEach((fn) => fn());

/** requireText: string[] — verilirse onay düğmesi, kullanıcı bu değerlerden birini (büyük/küçük harf ayrımsız) yazana kadar kapalıdır (yanlışlıkla silmeyi önler). */
export function askConfirm({ title, message, confirmLabel, cancelLabel, requireText }) {
  current?.resolve(false); // açık bir pencere varsa vazgeçilmiş sayılır
  return new Promise((resolve) => { current = { title, message, confirmLabel, cancelLabel, requireText, resolve }; emit(); });
}
export const getConfirm = () => current;
export const subscribeConfirm = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export function settleConfirm(value) {
  const c = current;
  current = null;
  emit();
  c?.resolve(value);
}
