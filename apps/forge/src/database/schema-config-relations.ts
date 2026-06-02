/**
 * Drizzle relations for schema-config tables.
 *
 * Extracted from schema.ts in #5337 to colocate table definitions with their relations.
 */
import { relations } from 'drizzle-orm';

import {
  systemSettings
} from './schema-config.js';

import {
  systemLlmDefaults
} from './schema-llm.js';

export const systemSettingsRelations = relations(systemSettings, () => ({}));


export const systemLlmDefaultsRelations = relations(systemLlmDefaults, () => ({}));

