/* Uygulama temasıyla uyumlu onay penceresi (window.confirm yerine). askConfirm(...) → Promise<boolean>.
   Pencereyi <ConfirmHost /> çizer (App.jsx içinde bir kez). */
let current = null;
const listeners = new Set();
const emit = () => listeners.forEach((fn) => fn());

export function askConfirm({ title, message, confirmLabel, cancelLabel }) {
  current?.resolve(false); // açık bir pencere varsa vazgeçilmiş sayılır
  return new Promise((resolve) => { current = { title, message, confirmLabel, cancelLabel, resolve }; emit(); });
}
export const getConfirm = () => current;
export const subscribeConfirm = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export function settleConfirm(value) {
  const c = current;
  current = null;
  emit();
  c?.resolve(value);
}
