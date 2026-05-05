import type { SystemIntegration } from '@/lib/admin-api';

export interface CoolifyFormValues {
  baseUrl: string;
  adminToken: string;
  serverId: string;
  destinationId: string;
  applicationsBaseDomain: string;
  isEnabled: boolean;
}

export function buildCoolifyFormValues(
  live: CoolifyFormValues | null,
  saved: SystemIntegration | null,
): CoolifyFormValues {
  return {
    baseUrl: live?.baseUrl ?? saved?.config?.baseUrl ?? '',
    adminToken: live?.adminToken ?? saved?.config?.adminToken ?? '',
    serverId: live?.serverId ?? saved?.config?.serverId ?? '',
    destinationId: live?.destinationId ?? saved?.config?.destinationId ?? '',
    applicationsBaseDomain: live?.applicationsBaseDomain ?? saved?.config?.applicationsBaseDomain ?? '',
    isEnabled: live?.isEnabled ?? saved?.isEnabled ?? true,
  };
}