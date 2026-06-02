/**
 * Barrel re-export for backward compat with `from '../schedules/tools'`.
 *
 * The actual implementation lives in `./tools/`. This file just re-exports
 * the public API so external consumers don't need to update their imports.
 */
// eslint-disable-next-line reexport-check/no-unnecessary-reexports -- root-level barrel for backward compat with existing imports
export {
  createAgentScheduleTools,
  createScheduleSchema,
  createScheduleForAgentSchema,
  updateScheduleSchema,
  type CreateScheduleInput,
  type CreateScheduleForAgentInput,
  type UpdateScheduleInput,
} from './tools/index';
