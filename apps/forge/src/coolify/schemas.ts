/**
 * Zod schemas for Coolify API responses.
 * Extracted from coolify/manager.ts to enable independent schema testing
 * and reduce the surface area of the main manager module.
 */

import { z } from 'zod';

export const GitHubAppSchema = z.object({
  id: z.number().int().optional(),
  uuid: z.string(),
  name: z.string().optional(),
  organization: z.string().nullish(),
  api_url: z.string().optional(),
  html_url: z.string().optional(),
}).passthrough();

export const GitHubRepositorySchema = z.object({
  id: z.union([z.number().int(), z.string()]).optional(),
  name: z.string(),
  full_name: z.string().optional(),
  default_branch: z.string().optional(),
  private: z.boolean().optional(),
}).passthrough();

export const GitHubBranchSchema = z.object({
  name: z.string(),
}).passthrough();

export const ApplicationSchema = z.object({
  id: z.union([z.number().int(), z.string()]).optional(),
  uuid: z.string(),
  name: z.string().optional(),
  fqdn: z.string().nullish(),
  status: z.string().nullish(),
  repository: z.string().nullish(),
  git_branch: z.string().nullish(),
  ports_exposes: z.string().nullish(),
  destination: z.object({
    uuid: z.string(),
    name: z.string().optional(),
  }).optional(),
}).passthrough();

export const ApplicationEnvSchema = z.object({
  id: z.union([z.number().int(), z.string()]).optional(),
  uuid: z.string().optional(),
  key: z.string(),
  value: z.string().nullish(),
  is_preview: z.boolean().optional(),
  is_build_time: z.boolean().optional(),
  is_literal: z.boolean().optional(),
  is_multiline: z.boolean().optional(),
  is_shown_once: z.boolean().optional(),
}).passthrough();

export const DeploymentSchema = z.object({
  id: z.union([z.number().int(), z.string()]).optional(),
  uuid: z.string().optional(),
  deployment_uuid: z.string().optional(),
  status: z.string().nullish(),
  logs: z.string().nullish(),
  created_at: z.union([z.number(), z.string()]).optional(),
}).passthrough();

export const ProjectSchema = z.object({
  uuid: z.string(),
  name: z.string().optional(),
}).passthrough();

export const EnvironmentSchema = z.object({
  uuid: z.string(),
  name: z.string().optional(),
}).passthrough();

export const ServerSchema = z.object({
  uuid: z.string(),
  name: z.string().optional(),
  wildcard_domain: z.string().optional(),
  proxy_uuid: z.string().optional(),
  proxy: z.object({
    uuid: z.string().optional(),
  }).partial().optional(),
}).passthrough();

function _toTimestamp(value: string | number | null): number {
  if (typeof value === 'number') {
    return value;
  }

  if (typeof value === 'string') {
    const numeric = Number(value);

    if (Number.isFinite(numeric)) {
      return numeric;
    }

    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

/** Keep for internal use only — not exported from the public helpers module */