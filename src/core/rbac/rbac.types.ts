export interface CreateRoleRequest {
  name: string;
  description?: string | undefined;
  permissions: string[];
}

export interface UpdateRoleRequest {
  name?: string | undefined;
  description?: string | undefined;
  permissions?: string[] | undefined;
  isActive?: boolean | undefined;
}

export interface AssignRoleRequest {
  userId: string;
  roleId: string;
}

export interface RoleResponse {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  permissions: string[];
  isSystem: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
