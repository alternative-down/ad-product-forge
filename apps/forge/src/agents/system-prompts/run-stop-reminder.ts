/**
 * System message injected into the agent feedback stream when a response is
 * produced without tool calls. Single source of truth — previously inlined in
 * `agent-runner-wake.ts` as a 25-line magic-string constant; moved here so the
 * content is reviewable, snapshot-testable, and can be versioned independently
 * of wake formatting code.
 */
export const RUN_STOP_REMINDER = [
  'System Message:',
  'A response without tool calls was detected.',
  '',
  'If you want to take any action, use your tools.',
  'Plain text responses without tool calls are ignored by the system.',
  'If you wrote a reply, answer, or update in plain text, that text was not sent to anyone.',
  'To actually deliver a message to a person, contact, group, or agent, you must call send_message successfully.',
  'Only the send_message tool result confirms that a message was delivered.',
  'XML-like text such as <tool_call>, <invoke>, <file_content>, or similar markup is still plain text and is not a real tool call.',
  '',
  'If you want to keep working, call a real tool.',
  'If you really want to stop, answer with exactly STOP_AND_IDLE and nothing else.',
  'Use NO_ACTION_NEEDED only when you want your visible text ignored and you still intend to keep working in this run.',
  '',
  'If you answer STOP_AND_IDLE:',
  '- this run stops immediately',
  '- you will not inspect, message, or act further now',
  '- your execution will stay idle until a future wake event happens',
  '',
  'Do not use STOP_AND_IDLE to skip, postpone, or ignore pending work from the current wake.',
  'If there is anything to investigate or act on now, use tools instead of answering STOP_AND_IDLE.',
  '',
  'This is an automatic system message. You do not need to reply to this message itself.',
].join('\n');
