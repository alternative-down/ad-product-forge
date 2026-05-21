/**
 * Mock for node-schedule used by schedule-lifecycle in tests.
 * Replaces the real node-schedule module so schedule-lifecycle can be tested
 * without needing a timer environment.
 */
const mockJob = {
  cancel: function () {
    /* noop */
  },
  nextInvocation: function () {
    return null;
  },
};

function scheduleJob(id, spec, fn) {
  return mockJob;
}

function cancelJob(id) {
  /* noop */
}

function gracefulShutdown() {
  return Promise.resolve();
}

module.exports = {
  scheduleJob,
  cancelJob,
  gracefulShutdown,
  Job: Object,
  RecurrenceSpecDateRange: Object,
};
