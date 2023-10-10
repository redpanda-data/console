// Copyright 2023 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package user

import (
	"context"
	"errors"
	"fmt"

	"connectrpc.com/connect"
	"go.uber.org/zap"

	apierrors "github.com/redpanda-data/console/backend/pkg/api/connect/errors"
	"github.com/redpanda-data/console/backend/pkg/config"
	"github.com/redpanda-data/console/backend/pkg/console"
	v1alpha1 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1alpha1"
	"github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1alpha1/dataplanev1alpha1connect"
	"github.com/redpanda-data/console/backend/pkg/redpanda"
)

var _ dataplanev1alpha1connect.UserServiceHandler = (*Service)(nil)

type Service struct {
	cfg         *config.Config
	logger      *zap.Logger
	consoleSvc  console.Servicer
	redpandaSvc *redpanda.Service

	isProtectedUserFn func(userName string) bool
}

func NewService(cfg *config.Config,
	logger *zap.Logger,
	redpandaSvc *redpanda.Service,
	consoleSvc console.Servicer,
	isProtectedUserFn func(userName string) bool,
) *Service {
	return &Service{
		cfg:               cfg,
		logger:            logger,
		consoleSvc:        consoleSvc,
		redpandaSvc:       redpandaSvc,
		isProtectedUserFn: isProtectedUserFn,
	}
}

func (s *Service) ListUsers(ctx context.Context, req *connect.Request[v1alpha1.ListUsersRequest]) (*connect.Response[v1alpha1.ListUsersResponse], error) {
	// 1. Check if we can list users
	if !s.cfg.Redpanda.AdminAPI.Enabled {
		return nil, apierrors.NewConnectError(
			connect.CodeUnavailable,
			errors.New("the redpanda admin api must be configured to list users"),
			apierrors.NewErrorInfo(apierrors.ReasonFeatureNotConfigured),
			apierrors.NewHelp(apierrors.NewHelpLinkConsoleReferenceConfig()),
		)
	}

	// 2. List users
	users, err := s.redpandaSvc.ListUsers(ctx)
	if err != nil {
		return nil, apierrors.NewConnectError(
			connect.CodeInternal,
			err,
			apierrors.NewErrorInfo(apierrors.ReasonRedpandaAdminAPIError),
		)
	}

	filteredUsers := make([]*v1alpha1.ListUsersResponse_User, 0)
	for _, user := range users {
		if s.isProtectedUserFn(user) {
			continue
		}
		filteredUsers = append(filteredUsers, &v1alpha1.ListUsersResponse_User{
			Name: user,
		})
	}

	return connect.NewResponse(&v1alpha1.ListUsersResponse{
		Users: filteredUsers,
	}), nil
}

func (s *Service) CreateUser(ctx context.Context, req *connect.Request[v1alpha1.CreateUserRequest]) (*connect.Response[v1alpha1.CreateUserResponse], error) {
	// 1. Check if we can create users
	if !s.cfg.Redpanda.AdminAPI.Enabled {
		return nil, apierrors.NewConnectError(
			connect.CodeUnavailable,
			errors.New("the redpanda admin api must be configured to create users"),
			apierrors.NewErrorInfo(apierrors.ReasonFeatureNotConfigured),
			apierrors.NewHelp(apierrors.NewHelpLinkConsoleReferenceConfig()),
		)
	}

	// 2. Check if requested username is a protected user name.
	if s.isProtectedUserFn(req.Msg.User.Name) {
		return nil, apierrors.NewConnectError(
			connect.CodePermissionDenied, // Internal because the mechanism should already be validated
			fmt.Errorf("the requested username is a protected user, choose a different username"),
			apierrors.NewErrorInfo(apierrors.ReasonInvalidInput),
		)
	}

	// 3. Map inputs from proto to admin api
	mechanism, err := saslMechanismToRedpandaAdminAPIString(req.Msg.User.Mechanism)
	if err != nil {
		return nil, apierrors.NewConnectError(
			connect.CodeInternal, // Internal because the mechanism should already be validated
			err,
			apierrors.NewErrorInfo(apierrors.ReasonConsoleError),
		)
	}

	// 4. Create user
	err = s.redpandaSvc.CreateUser(ctx, req.Msg.User.Name, req.Msg.User.Password, mechanism)
	if err != nil {
		return nil, apierrors.NewConnectError(
			connect.CodeInternal,
			err,
			apierrors.NewErrorInfo(apierrors.ReasonRedpandaAdminAPIError),
		)
	}

	res := &v1alpha1.CreateUserResponse{
		User: &v1alpha1.CreateUserResponse_User{
			Name:      req.Msg.User.Name,
			Mechanism: &req.Msg.User.Mechanism,
		},
	}
	return connect.NewResponse(res), nil
}

func (s *Service) UpdateUser(ctx context.Context, req *connect.Request[v1alpha1.UpdateUserRequest]) (*connect.Response[v1alpha1.UpdateUserResponse], error) {
	// 1. Check if we can update users
	if !s.cfg.Redpanda.AdminAPI.Enabled {
		return nil, apierrors.NewConnectError(
			connect.CodeUnavailable,
			errors.New("the redpanda admin api must be configured to update users"),
			apierrors.NewErrorInfo(apierrors.ReasonFeatureNotConfigured),
			apierrors.NewHelp(apierrors.NewHelpLinkConsoleReferenceConfig()),
		)
	}

	// 2. Check if requested username is a protected user name.
	if s.isProtectedUserFn(req.Msg.User.Name) {
		return nil, apierrors.NewConnectError(
			connect.CodePermissionDenied, // Internal because the mechanism should already be validated
			fmt.Errorf("the requested username is a protected user, choose a different username"),
			apierrors.NewErrorInfo(apierrors.ReasonInvalidInput),
		)
	}

	// 3. Map inputs from proto to admin api
	mechanism, err := saslMechanismToRedpandaAdminAPIString(req.Msg.User.Mechanism)
	if err != nil {
		return nil, apierrors.NewConnectError(
			connect.CodeInternal, // Internal because the mechanism should already be validated
			err,
			apierrors.NewErrorInfo(apierrors.ReasonConsoleError),
		)
	}

	// 4. Update user
	err = s.redpandaSvc.UpdateUser(ctx, req.Msg.User.Name, req.Msg.User.Password, mechanism)
	if err != nil {
		return nil, apierrors.NewConnectError(
			connect.CodeInternal,
			err,
			apierrors.NewErrorInfo(apierrors.ReasonRedpandaAdminAPIError),
		)
	}

	return connect.NewResponse(&v1alpha1.UpdateUserResponse{
		User: &v1alpha1.UpdateUserResponse_User{
			Name:      req.Msg.User.Name,
			Mechanism: &req.Msg.User.Mechanism,
		},
	}), nil
}

func (s *Service) DeleteUser(ctx context.Context, req *connect.Request[v1alpha1.DeleteUserRequest]) (*connect.Response[v1alpha1.DeleteUserResponse], error) {
	// 1. Check if we can delete users
	if !s.cfg.Redpanda.AdminAPI.Enabled {
		return nil, apierrors.NewConnectError(
			connect.CodeUnavailable,
			errors.New("the redpanda admin api must be configured to delete users"),
			apierrors.NewErrorInfo(apierrors.ReasonFeatureNotConfigured),
			apierrors.NewHelp(apierrors.NewHelpLinkConsoleReferenceConfig()),
		)
	}

	// 2. Check if requested username is a protected user name.
	if s.isProtectedUserFn(req.Msg.Name) {
		return nil, apierrors.NewConnectError(
			connect.CodePermissionDenied, // Internal because the mechanism should already be validated
			fmt.Errorf("the requested username is a protected user, choose a different username"),
			apierrors.NewErrorInfo(apierrors.ReasonInvalidInput),
		)
	}

	// 3. List users to check if the requested user exists. The Redpanda admin API
	// always returns ok, regardless whether the user exists or not.
	listedUsers, err := s.redpandaSvc.ListUsers(ctx)
	if err != nil {
		return nil, apierrors.NewConnectError(
			connect.CodeInternal,
			err,
			apierrors.NewErrorInfo(apierrors.ReasonRedpandaAdminAPIError),
		)
	}
	exists := false
	for _, user := range listedUsers {
		if user == req.Msg.Name {
			exists = true
			break
		}
	}
	if !exists {
		return nil, apierrors.NewConnectError(
			connect.CodeNotFound,
			errors.New("user not found"),
			apierrors.NewErrorInfo(apierrors.ReasonResourceNotFound),
		)
	}

	// 4. Delete user
	err = s.redpandaSvc.DeleteUser(ctx, req.Msg.Name)
	if err != nil {
		return nil, apierrors.NewConnectError(
			connect.CodeInternal,
			err,
			apierrors.NewErrorInfo(apierrors.ReasonRedpandaAdminAPIError),
		)
	}

	return connect.NewResponse(&v1alpha1.DeleteUserResponse{}), nil
}
