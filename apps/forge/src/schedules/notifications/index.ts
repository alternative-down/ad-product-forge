/**
 * Public API of the notifications subsystem.
 */
// eslint-disable-next-line reexport-check/no-unnecessary-reexports -- barrel aggregating SUT + wake content
export {
  createScheduleNotifications,
  type NotificationDependencies,
  type ScheduleRecordForNotification,
} from './notifications';
// eslint-disable-next-line reexport-check/no-unnecessary-reexports -- barrel for wake content helpers
export {
  parseScheduleDate,
  validateScheduleShape,
  assertFutureScheduledDate,
  createNotificationContent,
  createWakeContent,
  createHeartbeatWakeInstruction,
  toToolOutput,
} from './wake-content';
