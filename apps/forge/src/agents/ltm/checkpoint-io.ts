import fs from 'node:fs/promises';
import path from 'node:path';
import type { CheckpointedOmCheckpointPackageInput, CheckpointPackageManifest } from './store';
import {
  renderCheckpointPackageReadme,
  renderReflectionFile,
  renderObservationFile,
} from './renderers';
import { createId } from '../../utils/id';

export function computeCheckpointTimestamp(payload: CheckpointedOmCheckpointPackageInput): number {
  const allCreatedAts = [
    ...payload.reflections.map((r) => r.createdAt ?? r.generatedAt ?? 0),
    ...payload.observations.map((o) => o.createdAt ?? o.generatedAt ?? 0),
  ];
  if (allCreatedAts.length > 0) {
    return allCreatedAts.reduce(
      (earliest, ts) => Math.min(Number(earliest), Number(ts)),
      Number(allCreatedAts[0]!),
    );
  }
  return payload.checkpointSummary.updatedAt;
}

export function formatCheckpointPackageId(dayKey: string, existingPackageCount: number): string {
  return `${dayKey}_${String(existingPackageCount + 1).padStart(3, '0')}`;
}

export async function writeCheckpointFiles(
  tempPackagePath: string,
  payload: CheckpointedOmCheckpointPackageInput,
): Promise<void> {
  await fs.writeFile(
    path.resolve(tempPackagePath, 'README.md'),
    renderCheckpointPackageReadme({ payload }),
  );

  if (payload.reflections.length > 0) {
    await fs.mkdir(path.resolve(tempPackagePath, 'reflections'), { recursive: true });
  }
  for (const [index, reflection] of payload.reflections.entries()) {
    await fs.writeFile(
      path.resolve(
        tempPackagePath,
        'reflections',
        `reflection_${String(index + 1).padStart(3, '0')}.md`,
      ),
      renderReflectionFile(reflection),
    );
  }

  if (payload.observations.length > 0) {
    await fs.mkdir(path.resolve(tempPackagePath, 'observations'), { recursive: true });
  }
  for (const [index, observation] of payload.observations.entries()) {
    await fs.writeFile(
      path.resolve(
        tempPackagePath,
        'observations',
        `observation_${String(index + 1).padStart(4, '0')}.md`,
      ),
      renderObservationFile(observation),
    );
  }
}

export function buildCheckpointPackageManifest(
  packageId: string,
  payload: CheckpointedOmCheckpointPackageInput,
  checkpointTimestamp: number,
): CheckpointPackageManifest {
  return {
    packageId,
    checkpointGeneration: payload.toGeneration,
    fromGeneration: (payload.fromGeneration ?? null) as number | null,
    toGeneration: payload.toGeneration,
    createdAt: String(checkpointTimestamp),
    checkpointSummaryUpdatedAt: String(checkpointTimestamp),
    reflectionCount: payload.reflections.length,
    observationCount: payload.observations.length,
  };
}

export async function commitCheckpointPackage(
  packagePath: string,
  tempPackagePath: string,
): Promise<void> {
  await fs.rm(packagePath, { recursive: true, force: true });
  await fs.rename(tempPackagePath, packagePath);
}

export async function cleanupTempPackage(tempPackagePath: string): Promise<void> {
  await fs.rm(tempPackagePath, { recursive: true, force: true });
}

export async function prepareTempPackageDirectory(tempPackagePath: string): Promise<void> {
  await fs.rm(tempPackagePath, { recursive: true, force: true });
  await fs.mkdir(tempPackagePath, { recursive: true });
}

export function getTempPackagePath(packagePath: string): string {
  return `${packagePath}.${createId()}.tmp`;
}