/**
 * Backup somente local dos registros da antiga demonstracao ST1 Connect.
 * Nunca envie estas informacoes ao servidor e nunca altere o armazenamento existente.
 */
export const LEGACY_STORAGE_KEYS = ['st1-connect:v1', 'st1-connect:v1:recovery'] as const;

export interface LegacyBackup {
  format: 'st1-connect-local-backup/v1';
  origin: string;
  exportedAt: string;
  entries: Record<string, string>;
}

export function readLegacyBackup(
  storage: Pick<Storage, 'getItem'>,
  origin: string,
  at: Date = new Date(),
): LegacyBackup | null {
  const entries: Record<string, string> = {};
  for (const key of LEGACY_STORAGE_KEYS) {
    let value: string | null;
    try {
      value = storage.getItem(key);
    } catch {
      throw new Error('Este navegador impediu a leitura dos dados anteriores. Verifique o acesso ao armazenamento local.');
    }
    if (value !== null) entries[key] = value;
  }
  if (!Object.keys(entries).length) return null;
  return {
    format: 'st1-connect-local-backup/v1',
    origin,
    exportedAt: at.toISOString(),
    entries,
  };
}

export function downloadLegacyBackup(backup: LegacyBackup): void {
  const content = JSON.stringify(backup, null, 2);
  const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
  const href = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = href;
    a.download = 'st1-connect-dados-locais-' + backup.exportedAt.slice(0, 10) + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(href), 1000);
  }
}