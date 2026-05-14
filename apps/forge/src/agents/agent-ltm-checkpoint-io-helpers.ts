import fs from 'node:fs/promises';
import path from 'node:path';
import type { CheckpointedOmCheckpointPackageInput } from '@forge-runtime/core';
import type { CheckpointPackageManifest } from '../ltm/store';
import {
  renderCheckpointPackageReadme,
  renderReflectionFile,
  renderObservationFile,
} from './agent-ltm-checkpoint-render';
import { createId } from '../utils/id';

/**
 * Computes the checkpoint timestamp for a package.
 * Bugfix #1098: uses the earliest reflection or observation createdAt,
 * not the summary.updatedAt. This preserves temporal ordering.
 */
export function computeCheckpointTimestamp(
  payload: CheckpointedOmCheckpointPackageInput,
): number {
  const allCreatedAts = [
    ...payload.reflections.map((r) => r.createdAt),
    ...payload.observations.map((o) => o.createdAt),
  ];
  if (allCreatedAts.length > 0) {
    return allCreatedAts.reduce((earliest, ts) => (ts < earliest ? ts : earliest), allCreatedAts[0]);
  }
  return payload.checkpointSummary.updatedAt;
}

/**
 * Computes the package ID for a checkpoint package.
 * Format: YYYY-MM-DD_NNN (zero-padded sequence)
 */
export function formatCheckpointPackageId(
  dayKey: string,
  existingPackageCount: number,
): string {
  return `${dayKey}_${String(existingPackageCount + 1).padStart(3, '0')}`;
}

/**
 * Writes the directory structure and files for a checkpoint package.
 * Creates: README.md, reflections/, observations/
 * On error, cleans up the temp directory before rethrowing.
 */
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
      path.resolve(tempPackagePath, 'reflections', `reflection_${String(index + 1).padStart(3, '0')}.md`),
      renderReflectionFile(reflection),
    );
  }

  if (payload.observations.length > 0) {
    await fs.mkdir(path.resolve(tempPackagePath, 'observations'), { recursive: true });
  }
  for (const [index, observation] of payload.observations.entries()) {
    await fs.writeFile(
      path.resolve(tempPackagePath, 'observations', `observation_${String(index + 1).padStart(4, '0')}.md`),
      renderObservationFile(observation),
    );
  }
}

/**
 * Builds the CheckpointPackageManifest for a written checkpoint package.
 * Must be called after the package directory has been renamed to its final path.
 */
export function buildCheckpointPackageManifest(
  packageId: string,
  payload: CheckpointedOmCheckpointPackageInput,
  checkpointTimestamp: number,
): CheckpointPackageManifest {
  return {
    packageId,
    checkpointGeneration: payload.toGeneration,
    fromGeneration: payload.fromGeneration,
    toGeneration: payload.toGeneration,
    createdAt: checkpointTimestamp,
    checkpointSummaryUpdatedAt: checkpointTimestamp,
    reflectionCount: payload.reflections.length,
    observationCount: payload.observations.length,
  };
}

/**
 * Atomically replaces the old checkpoint package with the new one.
 * Removes oldPath, then renames tempPath → packagePath.
 */
export async function commitCheckpointPackage(
  packagePath: string,
  tempPackagePath: string,
): Promise<void> {
  await fs.rm(packagePath, { recursive: true, force: true });
  await fs.rename(tempPackagePath, packagePath);
}

/**
 * Cleans up a temp package directory on error.
 * Silently ignores cleanup failures.
 */
export async function cleanupTempPackage(tempPackagePath: string): Promise<void> {
  await fs.rm(tempPackagePath, { recursive: true, force: true });
}

/**
 * Prepares a temp package directory for writing: removes any existing
 * temp directory at the same path, then creates the directory fresh.
 */
export async function prepareTempPackageDirectory(tempPackagePath: string): Promise<void> {
  await fs.rm(tempPackagePath, { recursive: true, force: true });
  await fs.mkdir(tempPackagePath, { recursive: true });
}

/**
 * Returns the temp path for a checkpoint package.
 * Temp path is: {packagePath}.{randomId}.tmp
 */
export function getTempPackagePath(packagePath: string): string {
  return `${packagePath}.${createId()}.tmp`;
}