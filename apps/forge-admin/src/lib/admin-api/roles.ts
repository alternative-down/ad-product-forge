import { request } from './core';
import type { RoleItem, RolesResponse } from './types';

export function getRoles() {
  return request<RolesResponse>('/admin/roles');
}

export function createRole(input: {
  name: string;
  description?: string;
}) {
  return request<RoleItem>('/admin/role/create', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateRole(input: {
  roleId: string;
  name?: string;
  description?: string | null;
}) {
  return request<RoleItem>('/admin/role/update', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function deleteRole(roleId: string) {
  return request<{ success?: boolean; roleId?: string }>('/admin/role/delete', {
    method: 'POST',
    body: JSON.stringify({ roleId }),
  });
}

export function addRoleToolPermission(input: {
  roleId: string;
  toolId: string;
}) {
  return request<{ success?: boolean }>('/admin/role-tool-permission/add', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function removeRoleToolPermission(input: {
  roleId: string;
  toolId: string;
}) {
  return request<{ success?: boolean }>('/admin/role-tool-permission/remove', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function addRoleCapability(input: {
  roleId: string;
  capabilityId: string;
}) {
  return request<{ success?: boolean }>('/admin/role-capability/add', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function removeRoleCapability(input: {
  roleId: string;
  capabilityId: string;
}) {
  return request<{ success?: boolean }>('/admin/role-capability/remove', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
