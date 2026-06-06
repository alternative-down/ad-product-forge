import { describe, it, expect } from 'vitest';
import { RUN_STOP_REMINDER } from './run-stop-reminder';

describe('RUN_STOP_REMINDER', () => {
  it('is a string (array joined with newlines)', () => {
    expect(typeof RUN_STOP_REMINDER).toBe('string');
    expect(RUN_STOP_REMINDER.length).toBeGreaterThan(0);
  });

  it('contains STOP_AND_IDLE instruction', () => {
    expect(RUN_STOP_REMINDER).toContain('STOP_AND_IDLE');
  });

  it('warns about plain text not being sent', () => {
    expect(RUN_STOP_REMINDER).toContain('plain text');
    expect(RUN_STOP_REMINDER).toContain('send_message');
  });

  it('is joined with newline separators', () => {
    expect(RUN_STOP_REMINDER).toContain('\n');
  });

  it('mentions NO_ACTION_NEEDED for ignored-visible-text semantics', () => {
    expect(RUN_STOP_REMINDER).toContain('NO_ACTION_NEEDED');
  });

  // Snapshot test: locks the exact text of the system message. Any edit to
  // RUN_STOP_REMINDER must be a deliberate, reviewable change — reviewers will
  // see the snapshot diff and can spot wording shifts that the other content
  // tests would miss (e.g. accidental typo, re-ordered lines, dropped
  // instruction).
  it('matches the locked snapshot of the full system message', () => {
    expect(RUN_STOP_REMINDER).toMatchSnapshot();
  });
});
