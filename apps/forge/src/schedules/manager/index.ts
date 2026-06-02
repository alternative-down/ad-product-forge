/**
 * Public API of the manager subsystem.
 */
// eslint-disable-next-line reexport-check/no-unnecessary-reexports -- barrel aggregating SUT + sub-modules
export {
  createAgentScheduleManager,
  type AgentScheduleManager,
} from './manager';
// eslint-disable-next-line reexport-check/no-unnecessary-reexports -- barrel for DB CRUD
export { createAgentScheduleStore, type UpdateAgentScheduleInput } from './store';
// eslint-disable-next-line reexport-check/no-unnecessary-reexports -- barrel for input normalization
export {
  normalizeScheduleUpdate,
  buildScheduleUpdateInput,
  buildScheduleRollbackInput,
  type NormalizedScheduleUpdate,
  type ScheduleUpdateInputParts,
  type ExistingScheduleFields,
} from './normalize';
// eslint-disable-next-line reexport-check/no-unnecessary-reexports -- barrel for auth checks
export {
  isScheduleEditor,
  requireScheduleEditor,
  requireScheduleDeleter,
  type ScheduleAuthorizable,
} from './auth';
