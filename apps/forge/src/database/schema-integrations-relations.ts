/**
 * Drizzle relations for schema-integrations tables.
 *
 * Extracted from schema.ts in #5337 to colocate table definitions with their relations.
 */
import { relations } from 'drizzle-orm';

import {
  systemIntegrations
} from './schema-integrations.js';

export const systemIntegrationsRelations = relations(systemIntegrations, () => ({}));

