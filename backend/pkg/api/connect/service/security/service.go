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
	"fmt"
	"net/http"
	"sort"
	"strconv"
	"strings"

	"connectrpc.com/connect"
	"go.uber.org/zap"

	"github.com/redpanda-data/common-go/api/pagination"
	apierrors "github.com/redpanda-data/console/backend/pkg/api/connect/errors"
	"github.com/redpanda-data/console/backend/pkg/api/hooks"
	"github.com/redpanda-data/console/backend/pkg/config"
	v1alpha1 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/console/v1alpha1"
	v1alpha1dp "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1alpha1"
	"github.com/redpanda-data/console/backend/pkg/redpanda"
)

// Service that implements the SecurityServiceHandler interface.
type Service struct {
	cfg         *config.Config
	logger      *zap.Logger
	redpandaSvc *redpanda.Service
	authHooks   hooks.AuthorizationHooks
}

// NewService creates a new Console Security service handler.
func NewService(
	cfg *config.Config,
	logger *zap.Logger,
	redpandaSvc *redpanda.Service,
	authHooks hooks.AuthorizationHooks,
) *Service {
	return &Service{
		cfg:         cfg,
		logger:      logger,
		redpandaSvc: redpandaSvc,
		authHooks:   authHooks,
	}
}

// ListRoles lists all the roles in the system.
func (s *Service) ListRoles(ctx context.Context, req *connect.Request[v1alpha1.ListRolesRequest]) (*connect.Response[v1alpha1.ListRolesResponse], error) {
	if !s.cfg.Redpanda.AdminAPI.Enabled {
		return nil, apierrors.NewRedpandaAdminAPINotConfiguredError()
	}

	principalType, principal := parsePrincipal(req.Msg.GetFilter().GetPrincipal())

	res, err := s.redpandaSvc.ListRoles(ctx,
		req.Msg.GetFilter().GetNamePrefix(),
		principal, principalType)
	if err != nil {
		if err != nil {
			return nil, apierrors.NewConnectErrorFromRedpandaAdminAPIError(err, "")
		}
	}

	protoRoles := adminAPIRolesToProto(res.Roles)

	// Add pagination
	var nextPageToken string
	if req.Msg.GetPageSize() > 0 {
		sort.SliceStable(protoRoles, func(i, j int) bool {
			return protoRoles[i].Name < protoRoles[j].Name
		})

		page, token, err := pagination.SliceToPaginatedWithToken(protoRoles, int(req.Msg.PageSize), req.Msg.GetPageToken(), "name", func(x *v1alpha1.Role) string {
			return x.GetName()
		})

		if err != nil {
			return nil, apierrors.NewConnectError(
				connect.CodeInternal,
				fmt.Errorf("failed to apply pagination: %w", err),
				apierrors.NewErrorInfo(v1alpha1dp.Reason_REASON_CONSOLE_ERROR.String()),
			)
		}
		nextPageToken = token
		protoRoles = page
	}

	return connect.NewResponse(&v1alpha1.ListRolesResponse{
		Roles:         protoRoles,
		NextPageToken: nextPageToken,
	}), nil
}

// CreateRole creates a role.
func (s *Service) CreateRole(ctx context.Context, req *connect.Request[v1alpha1.CreateRoleRequest]) (*connect.Response[v1alpha1.CreateRoleResponse], error) {
	if !s.cfg.Redpanda.AdminAPI.Enabled {
		return nil, apierrors.NewRedpandaAdminAPINotConfiguredError()
	}

	res, err := s.redpandaSvc.CreateRole(ctx, req.Msg.GetRole().GetName())
	if err != nil {
		if err != nil {
			return nil, apierrors.NewConnectErrorFromRedpandaAdminAPIError(err, "")
		}
	}

	return connect.NewResponse(&v1alpha1.CreateRoleResponse{
		Role: &v1alpha1.Role{Name: res.RoleName},
	}), nil
}

// GetRole gets a specific role.
func (s *Service) GetRole(ctx context.Context, req *connect.Request[v1alpha1.GetRoleRequest]) (*connect.Response[v1alpha1.GetRoleResponse], error) {
	if !s.cfg.Redpanda.AdminAPI.Enabled {
		return nil, apierrors.NewRedpandaAdminAPINotConfiguredError()
	}

	res, err := s.redpandaSvc.GetRole(ctx, req.Msg.GetRoleName())
	if err != nil {
		if err != nil {
			return nil, apierrors.NewConnectErrorFromRedpandaAdminAPIError(err, "")
		}
	}

	return connect.NewResponse(&v1alpha1.GetRoleResponse{
		Role:    &v1alpha1.Role{Name: res.RoleName},
		Members: adminAPIRoleMembersToProto(res.Members),
	}), nil
}

// UpdateRole updates role name and any other properties.
func (s *Service) UpdateRole(ctx context.Context, req *connect.Request[v1alpha1.UpdateRoleRequest]) (*connect.Response[v1alpha1.UpdateRoleResponse], error) {
	if !s.cfg.Redpanda.AdminAPI.Enabled {
		return nil, apierrors.NewRedpandaAdminAPINotConfiguredError()
	}

	res, err := s.redpandaSvc.UpdateRole(ctx, req.Msg.GetRoleName(), redpanda.UpdateRole{
		RoleName: req.Msg.GetRole().GetName(),
	})
	if err != nil {
		if err != nil {
			return nil, apierrors.NewConnectErrorFromRedpandaAdminAPIError(err, "")
		}
	}

	return connect.NewResponse(&v1alpha1.UpdateRoleResponse{
		Role: &v1alpha1.Role{Name: res.RoleName},
	}), nil
}

// DeleteRole deletes a role.
func (s *Service) DeleteRole(ctx context.Context, req *connect.Request[v1alpha1.DeleteRoleRequest]) (*connect.Response[v1alpha1.DeleteRoleResponse], error) {
	if !s.cfg.Redpanda.AdminAPI.Enabled {
		return nil, apierrors.NewRedpandaAdminAPINotConfiguredError()
	}

	err := s.redpandaSvc.DeleteRole(ctx, req.Msg.GetRoleName(), req.Msg.GetDeleteAcls())
	if err != nil {
		if err != nil {
			return nil, apierrors.NewConnectErrorFromRedpandaAdminAPIError(err, "")
		}
	}

	connectResponse := connect.NewResponse(&v1alpha1.DeleteRoleResponse{})
	connectResponse.Header().Set("x-http-code", strconv.Itoa(http.StatusNoContent))

	return connectResponse, nil
}

// ListRoleMembers lists all the principals assigned to a role.
func (s *Service) ListRoleMembers(ctx context.Context, req *connect.Request[v1alpha1.ListRoleMembersRequest]) (*connect.Response[v1alpha1.ListRoleMembersResponse], error) {
	if !s.cfg.Redpanda.AdminAPI.Enabled {
		return nil, apierrors.NewRedpandaAdminAPINotConfiguredError()
	}

	res, err := s.redpandaSvc.RoleMembers(ctx, req.Msg.GetRoleName())
	if err != nil {
		if err != nil {
			return nil, apierrors.NewConnectErrorFromRedpandaAdminAPIError(err, "")
		}
	}

	nameContains := req.Msg.GetFilter().GetNameContains()
	var out []redpanda.RoleMember
	if nameContains == "" {
		out = res.Members
	} else {
		out = make([]redpanda.RoleMember, 0, len(res.Members))
		for _, m := range res.Members {
			if strings.Contains(m.Name, nameContains) {
				out = append(out, m)
			}
		}
	}

	protoMembers := adminAPIRoleMembersToProto(out)

	// Add pagination
	var nextPageToken string
	if req.Msg.GetPageSize() > 0 {
		sort.SliceStable(protoMembers, func(i, j int) bool {
			return protoMembers[i].Principal < protoMembers[j].Principal
		})

		page, token, err := pagination.SliceToPaginatedWithToken(protoMembers, int(req.Msg.PageSize), req.Msg.GetPageToken(), "principal", func(x *v1alpha1.RoleMembership) string {
			return x.GetPrincipal()
		})

		if err != nil {
			return nil, apierrors.NewConnectError(
				connect.CodeInternal,
				fmt.Errorf("failed to apply pagination: %w", err),
				apierrors.NewErrorInfo(v1alpha1dp.Reason_REASON_CONSOLE_ERROR.String()),
			)
		}
		nextPageToken = token
		protoMembers = page
	}

	return connect.NewResponse(&v1alpha1.ListRoleMembersResponse{
		Members:       protoMembers,
		NextPageToken: nextPageToken,
	}), nil
}

// UpdateRoleMembership updates role membership, adding and removing principals assigned to the role.
func (s *Service) UpdateRoleMembership(context.Context, *connect.Request[v1alpha1.UpdateRoleMembershipRequest]) (*connect.Response[v1alpha1.UpdateRoleMembershipResponse], error) {
	if !s.cfg.Redpanda.AdminAPI.Enabled {
		return nil, apierrors.NewRedpandaAdminAPINotConfiguredError()
	}

	return nil, connect.NewError(connect.CodeUnimplemented, errors.New("redpanda.api.console.v1alpha1.SecurityService.UpdateRoleMembership is not implemented"))
}
