let counter = 0;
/** A client idempotency key; authentication is always the server-only cookie. */
export function temporaryId(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  if (globalThis.crypto?.getRandomValues) {
    const values = new Uint8Array(16); globalThis.crypto.getRandomValues(values);
    values[6]=(values[6]&15)|64;values[8]=(values[8]&63)|128;
    const hex=Array.from(values,value=>value.toString(16).padStart(2,'0')).join('');
    return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
  }
  counter++;
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.floor(Math.random()*16);return (c==='x'?r:(r&3)|8).toString(16);});
}
