// Re-export everything from schema for backwards compatibility
// eslint-disable-next-line reexport-check/no-unnecessary-reexports -- barrel aggregating Database type for downstream consumers; many files import `Database` from this index
export type { Database } from './client.js';
