/**
 * Barrel re-export for backward compat with `from '../schedules/manager'`.
 *
 * The actual implementation lives in `./manager/`. This file just re-exports
 * the public API so external consumers don't need to update their imports.
 */
// eslint-disable-next-line reexport-check/no-unnecessary-reexports -- root-level barrel for backward compat
export {
  createAgentScheduleManager,
  type AgentScheduleManager,
  createAgentScheduleStore,
  type UpdateAgentScheduleInput,
  normalizeScheduleUpdate,
  buildScheduleUpdateInput,
  buildScheduleRollbackInput,
  type NormalizedScheduleUpdate,
  type ScheduleUpdateInputParts,
  type ExistingScheduleFields,
  isScheduleEditor,
  requireScheduleEditor,
  requireScheduleDeleter,
  type ScheduleAuthorizable,
} from './manager/index';
