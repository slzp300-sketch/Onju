const PREFIX = 'onju-draft:v1:';
export interface LocalDraft<T> { version: 1; owner: string; document: string; savedAt: string; values: T }
const keyFor = (owner: string, document: string) => `${PREFIX}${encodeURIComponent(owner)}:${encodeURIComponent(document)}`;

export function readDraft<T>(owner: string, document: string, validate: (value: unknown) => value is T): LocalDraft<T> | null {
  const raw = localStorage.getItem(keyFor(owner, document));
  if (!raw) return null;
  const data = JSON.parse(raw) as LocalDraft<unknown>;
  if (data?.version !== 1 || data.owner !== owner || data.document !== document ||
    typeof data.savedAt !== 'string' || !Number.isFinite(Date.parse(data.savedAt)) || !validate(data.values)) {
    throw new Error('Invalid draft');
  }
  return data as LocalDraft<T>;
}
export function writeDraft<T>(owner: string, document: string, values: T) {
  const draft: LocalDraft<T> = { version: 1, owner, document, savedAt: new Date().toISOString(), values };
  localStorage.setItem(keyFor(owner, document), JSON.stringify(draft));
  window.dispatchEvent(new Event('onju-drafts-changed'));
}
export function removeDraft(owner: string, document: string) { localStorage.removeItem(keyFor(owner, document)); window.dispatchEvent(new Event('onju-drafts-changed')); }
export function listDrafts<T>(owner: string, documentPrefix: string, validate: (value: unknown) => value is T): LocalDraft<T>[] {
  const prefix = `${PREFIX}${encodeURIComponent(owner)}:`;
  return Object.keys(localStorage).filter(key=>key.startsWith(prefix)).flatMap(key=>{
    const document = decodeURIComponent(key.slice(prefix.length));
    if (!document.startsWith(documentPrefix)) return [];
    const saved = readDraft(owner,document,validate);
    return saved ? [saved] : [];
  });
}
export function removeOwnerDrafts(owner: string) {
  const prefix = `${PREFIX}${encodeURIComponent(owner)}:`;
  Object.keys(localStorage).filter(key => key.startsWith(prefix)).forEach(key => localStorage.removeItem(key));
}
