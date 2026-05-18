import type { CheckpointedOmCheckpointPackageInput } from './ltm/store';

interface ReflectionItem {
  createdAt?: string | number;
  [key: string]: unknown;
}
interface ObservationItem {
  createdAt?: string | number;
  [key: string]: unknown;
}

export function renderCheckpointPackageReadme(input: {
  payload: CheckpointedOmCheckpointPackageInput;
}) {
  return [(input.payload.checkpointSummary?.text ?? "").trim(), ''].join('\n');
}

export function renderReflectionFile(
  reflection: ReflectionItem,
) {
  return [
    '---',
    `createdAt: ${reflection.createdAt}`,
    '---',
    '',
    (reflection as any).text.trim(),
    '',
  ].join('\n');
}

export function renderObservationFile(
  observation: ObservationItem,
) {
  return [
    '---',
    `createdAt: ${observation.createdAt}`,
    '---',
    '',
    (observation as any).text.trim(),
    '',
  ].join('\n');
}