// Copyright 2022 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package redpanda

import (
	"context"

	adminapi "github.com/redpanda-data/common-go/rpadmin"
)

// ListRoles lists all roles in the Redpanda cluster.
func (s *Service) ListRoles(ctx context.Context, prefix, principal, principalType string) (adminapi.RolesResponse, error) {
	return s.adminClient.Roles(ctx, prefix, principal, principalType)
}

// CreateRole creates a new role in the Redpanda cluster.
func (s *Service) CreateRole(ctx context.Context, name string) (adminapi.CreateRole, error) {
	return s.adminClient.CreateRole(ctx, name)
}

// DeleteRole deletes a Role in Redpanda with the given name. If deleteACL is
// true, Redpanda will delete ACLs bound to the role.
func (s *Service) DeleteRole(ctx context.Context, name string, deleteACL bool) error {
	return s.adminClient.DeleteRole(ctx, name, deleteACL)
}

// AssignRole assign the role 'roleName' to the passed members.
func (s *Service) AssignRole(ctx context.Context, roleName string, add []adminapi.RoleMember) (adminapi.PatchRoleResponse, error) {
	return s.adminClient.AssignRole(ctx, roleName, add)
}

// UnassignRole unassigns the role 'roleName' from the passed members.
func (s *Service) UnassignRole(ctx context.Context, roleName string, remove []adminapi.RoleMember) (adminapi.PatchRoleResponse, error) {
	return s.adminClient.UnassignRole(ctx, roleName, remove)
}

// RoleMembers returns the list of RoleMembers of a given role.
func (s *Service) RoleMembers(ctx context.Context, roleName string) (adminapi.RoleMemberResponse, error) {
	return s.adminClient.RoleMembers(ctx, roleName)
}

// GetRole returns the role.
func (s *Service) GetRole(ctx context.Context, roleName string) (adminapi.RoleDetailResponse, error) {
	return s.adminClient.Role(ctx, roleName)
}

// UpdateRoleMembership updates the role membership using Redpanda Admin API.
func (s *Service) UpdateRoleMembership(ctx context.Context, roleName string, add, remove []adminapi.RoleMember, createRole bool) (adminapi.PatchRoleResponse, error) {
	return s.adminClient.UpdateRoleMembership(ctx, roleName, add, remove, createRole)
}
