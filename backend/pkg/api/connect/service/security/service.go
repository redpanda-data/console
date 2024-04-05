// Copyright 2023 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

// Package security contains the implementation of the security service RPC endpoints.
package security

import (
	"context"
	"errors"

	"connectrpc.com/connect"
	"go.uber.org/zap"

	apierrors "github.com/redpanda-data/console/backend/pkg/api/connect/errors"
	"github.com/redpanda-data/console/backend/pkg/api/hooks"
	v1alpha1 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/console/v1alpha1"
	"github.com/redpanda-data/console/backend/pkg/redpanda"
)

// Service that implements the SecurityServiceHandler interface.
type Service struct {
	// cfg         *config.Config
	logger      *zap.Logger
	redpandaSvc *redpanda.Service
	authHooks   hooks.AuthorizationHooks
}

// NewService creates a new Console Security service handler.
func NewService(
	logger *zap.Logger,
	redpandaSvc *redpanda.Service,
	authHooks hooks.AuthorizationHooks,
) *Service {
	return &Service{
		logger:      logger,
		redpandaSvc: redpandaSvc,
		authHooks:   authHooks,
	}
}

// ListRoles lists all the roles in the system.
func (s *Service) ListRoles(ctx context.Context, req *connect.Request[v1alpha1.ListRolesRequest]) (*connect.Response[v1alpha1.ListRolesResponse], error) {
	principalType, principal := parsePrincipal(req.Msg.GetFilter().GetPrincipal())

	res, err := s.redpandaSvc.ListRoles(ctx,
		req.Msg.GetFilter().GetNamePrefix(),
		principal, principalType)
	if err != nil {
		if err != nil {
			return nil, apierrors.NewConnectErrorFromRedpandaAdminAPIError(err, "")
		}
	}

	return connect.NewResponse(&v1alpha1.ListRolesResponse{Roles: adminAPIRolesToProto(res.Roles)}), nil
}

// CreateRole creates a role.
func (*Service) CreateRole(context.Context, *connect.Request[v1alpha1.CreateRoleRequest]) (*connect.Response[v1alpha1.CreateRoleResponse], error) {
	return nil, connect.NewError(connect.CodeUnimplemented, errors.New("redpanda.api.console.v1alpha1.SecurityService.CreateRole is not implemented"))
}

// GetRole gets a specific role.
func (*Service) GetRole(context.Context, *connect.Request[v1alpha1.GetRoleRequest]) (*connect.Response[v1alpha1.GetRoleResponse], error) {
	return nil, connect.NewError(connect.CodeUnimplemented, errors.New("redpanda.api.console.v1alpha1.SecurityService.GetRole is not implemented"))
}

// UpdateRole updates role name and any other properties.
func (*Service) UpdateRole(context.Context, *connect.Request[v1alpha1.UpdateRoleRequest]) (*connect.Response[v1alpha1.UpdateRoleResponse], error) {
	return nil, connect.NewError(connect.CodeUnimplemented, errors.New("redpanda.api.console.v1alpha1.SecurityService.UpdateRole is not implemented"))
}

// DeleteRole deletes a role.
func (*Service) DeleteRole(context.Context, *connect.Request[v1alpha1.DeleteRoleRequest]) (*connect.Response[v1alpha1.DeleteRoleResponse], error) {
	return nil, connect.NewError(connect.CodeUnimplemented, errors.New("redpanda.api.console.v1alpha1.SecurityService.DeleteRole is not implemented"))
}

// ListRoleMembers lists all the principals assigned to a role.
func (*Service) ListRoleMembers(context.Context, *connect.Request[v1alpha1.ListRoleMembersRequest]) (*connect.Response[v1alpha1.ListRoleMembersResponse], error) {
	return nil, connect.NewError(connect.CodeUnimplemented, errors.New("redpanda.api.console.v1alpha1.SecurityService.ListRoleMembers is not implemented"))
}

// UpdateRoleMembership updates role membership, adding and removing principals assigned to the role.
func (*Service) UpdateRoleMembership(context.Context, *connect.Request[v1alpha1.UpdateRoleMembershipRequest]) (*connect.Response[v1alpha1.UpdateRoleMembershipResponse], error) {
	return nil, connect.NewError(connect.CodeUnimplemented, errors.New("redpanda.api.console.v1alpha1.SecurityService.UpdateRoleMembership is not implemented"))
}
