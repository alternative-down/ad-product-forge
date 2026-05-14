import type { CheckpointedOmCheckpointPackageInput } from '../ltm/store';

export function renderCheckpointPackageReadme(input: {
  payload: CheckpointedOmCheckpointPackageInput;
}) {
  return [input.payload.checkpointSummary.text.trim(), ''].join('\n');
}

export function renderReflectionFile(
  reflection: CheckpointedOmCheckpointPackageInput['reflections'][number],
) {
  return [
    '---',
    `createdAt: ${reflection.createdAt}`,
    '---',
    '',
    reflection.text.trim(),
    '',
  ].join('\n');
}

export function renderObservationFile(
  observation: CheckpointedOmCheckpointPackageInput['observations'][number],
) {
  return [
    '---',
    `createdAt: ${observation.createdAt}`,
    '---',
    '',
    observation.text.trim(),
    '',
  ].join('\n');
}