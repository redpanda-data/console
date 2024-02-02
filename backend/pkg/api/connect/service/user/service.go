// Copyright 2023 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

// Package user contains the implementation of all User endpoints.
package user

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"connectrpc.com/connect"
	"go.uber.org/zap"
	"google.golang.org/genproto/googleapis/rpc/errdetails"

	apierrors "github.com/redpanda-data/console/backend/pkg/api/connect/errors"
	"github.com/redpanda-data/console/backend/pkg/config"
	"github.com/redpanda-data/console/backend/pkg/console"
	commonv1alpha1 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/common/v1alpha1"
	v1alpha1 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1alpha1"
	"github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1alpha1/dataplanev1alpha1connect"
	"github.com/redpanda-data/console/backend/pkg/redpanda"
)

var _ dataplanev1alpha1connect.UserServiceHandler = (*Service)(nil)

// Service that implements the UserServiceHandler interface. This includes all
// RPCs to manage Redpanda or Kafka users.
type Service struct {
	cfg         *config.Config
	logger      *zap.Logger
	consoleSvc  console.Servicer
	redpandaSvc *redpanda.Service

	isProtectedUserFn func(userName string) bool
}

// NewService creates a new user service handler.
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

// ListUsers returns a list of all existing users.
func (s *Service) ListUsers(ctx context.Context, req *connect.Request[v1alpha1.ListUsersRequest]) (*connect.Response[v1alpha1.ListUsersResponse], error) {
	// 1. Check if we can list users
	if !s.cfg.Redpanda.AdminAPI.Enabled {
		return nil, apierrors.NewConnectError(
			connect.CodeUnimplemented,
			errors.New("the redpanda admin api must be configured to list users"),
			apierrors.NewErrorInfo(v1alpha1.Reason_REASON_FEATURE_NOT_CONFIGURED.String()),
			apierrors.NewHelp(apierrors.NewHelpLinkConsoleReferenceConfig()),
		)
	}

	// 2. List users
	users, err := s.redpandaSvc.ListUsers(ctx)
	if err != nil {
		return nil, apierrors.NewConnectError(
			connect.CodeInternal,
			err,
			apierrors.NewErrorInfo(v1alpha1.Reason_REASON_REDPANDA_ADMIN_API_ERROR.String()),
		)
	}

	// doesUserPassFilter returns true if either no filter is provided or
	// if the given username passes the given filter criteria.
	doesUserPassFilter := func(username string) bool {
		if req.Msg.Filter == nil {
			return true
		}

		if req.Msg.Filter.Name == username {
			return true
		}

		if req.Msg.Filter.NameContains != "" && strings.Contains(username, req.Msg.Filter.NameContains) {
			return true
		}

		return false
	}

	filteredUsers := make([]*v1alpha1.ListUsersResponse_User, 0)
	for _, user := range users {
		if s.isProtectedUserFn(user) {
			continue
		}

		// Remove users that do not pass the filter criteria
		if !doesUserPassFilter(user) {
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

// CreateUser creates a new Redpanda/Kafka user.
func (s *Service) CreateUser(ctx context.Context, req *connect.Request[v1alpha1.CreateUserRequest]) (*connect.Response[v1alpha1.CreateUserResponse], error) {
	// 1. Check if we can create users
	if !s.cfg.Redpanda.AdminAPI.Enabled {
		return nil, apierrors.NewConnectError(
			connect.CodeUnimplemented,
			errors.New("the redpanda admin api must be configured to create users"),
			apierrors.NewErrorInfo(v1alpha1.Reason_REASON_FEATURE_NOT_CONFIGURED.String()),
			apierrors.NewHelp(apierrors.NewHelpLinkConsoleReferenceConfig()),
		)
	}

	// 2. Check if requested username is a protected user name.
	if s.isProtectedUserFn(req.Msg.User.Name) {
		return nil, apierrors.NewConnectError(
			connect.CodeInvalidArgument,
			fmt.Errorf("the requested username is a protected user, choose a different username"),
			apierrors.NewErrorInfo(commonv1alpha1.Reason_REASON_INVALID_INPUT.String()),
			apierrors.NewBadRequest(&errdetails.BadRequest_FieldViolation{
				Field:       "user.name",
				Description: "User name is a protected user name. Choose a different name.",
			}),
		)
	}

	// 3. Map inputs from proto to admin api
	mechanism, err := saslMechanismToRedpandaAdminAPIString(req.Msg.User.Mechanism)
	if err != nil {
		return nil, apierrors.NewConnectError(
			connect.CodeInternal, // Internal because the mechanism should already be validated
			err,
			apierrors.NewErrorInfo(commonv1alpha1.Reason_REASON_INVALID_INPUT.String()),
		)
	}

	// 4. Create user
	err = s.redpandaSvc.CreateUser(ctx, req.Msg.User.Name, req.Msg.User.Password, mechanism)
	if err != nil {
		return nil, apierrors.NewConnectError(
			connect.CodeInternal,
			err,
			apierrors.NewErrorInfo(v1alpha1.Reason_REASON_REDPANDA_ADMIN_API_ERROR.String()),
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

// UpdateUser upserts a new Redpanda/Kafka user. This equals a PUT operation.
func (s *Service) UpdateUser(ctx context.Context, req *connect.Request[v1alpha1.UpdateUserRequest]) (*connect.Response[v1alpha1.UpdateUserResponse], error) {
	// 1. Check if we can update users
	if !s.cfg.Redpanda.AdminAPI.Enabled {
		return nil, apierrors.NewConnectError(
			connect.CodeUnimplemented,
			errors.New("the redpanda admin api must be configured to update users"),
			apierrors.NewErrorInfo(v1alpha1.Reason_REASON_FEATURE_NOT_CONFIGURED.String()),
			apierrors.NewHelp(apierrors.NewHelpLinkConsoleReferenceConfig()),
		)
	}

	// 2. Check if requested username is a protected user name.
	if s.isProtectedUserFn(req.Msg.User.Name) {
		return nil, apierrors.NewConnectError(
			connect.CodeInvalidArgument,
			fmt.Errorf("the requested username is a protected user, choose a different username"),
			apierrors.NewErrorInfo(commonv1alpha1.Reason_REASON_INVALID_INPUT.String()),
			apierrors.NewBadRequest(&errdetails.BadRequest_FieldViolation{
				Field:       "user.name",
				Description: "User name is a protected user name. Choose a different name.",
			}),
		)
	}

	// 3. Map inputs from proto to admin api
	mechanism, err := saslMechanismToRedpandaAdminAPIString(req.Msg.User.Mechanism)
	if err != nil {
		return nil, apierrors.NewConnectError(
			connect.CodeInternal, // Internal because the mechanism should already be validated
			err,
			apierrors.NewErrorInfo(commonv1alpha1.Reason_REASON_INVALID_INPUT.String()),
		)
	}

	// 4. Update user
	err = s.redpandaSvc.UpdateUser(ctx, req.Msg.User.Name, req.Msg.User.Password, mechanism)
	if err != nil {
		return nil, apierrors.NewConnectError(
			connect.CodeInternal,
			err,
			apierrors.NewErrorInfo(v1alpha1.Reason_REASON_REDPANDA_ADMIN_API_ERROR.String()),
		)
	}

	return connect.NewResponse(&v1alpha1.UpdateUserResponse{
		User: &v1alpha1.UpdateUserResponse_User{
			Name:      req.Msg.User.Name,
			Mechanism: &req.Msg.User.Mechanism,
		},
	}), nil
}

// DeleteUser deletes an existing Redpanda/Kafka user.
func (s *Service) DeleteUser(ctx context.Context, req *connect.Request[v1alpha1.DeleteUserRequest]) (*connect.Response[v1alpha1.DeleteUserResponse], error) {
	// 1. Check if we can delete users
	if !s.cfg.Redpanda.AdminAPI.Enabled {
		return nil, apierrors.NewConnectError(
			connect.CodeUnimplemented,
			errors.New("the redpanda admin api must be configured to delete users"),
			apierrors.NewErrorInfo(v1alpha1.Reason_REASON_FEATURE_NOT_CONFIGURED.String()),
			apierrors.NewHelp(apierrors.NewHelpLinkConsoleReferenceConfig()),
		)
	}

	// 2. Check if requested username is a protected user name.
	if s.isProtectedUserFn(req.Msg.Name) {
		return nil, apierrors.NewConnectError(
			connect.CodeInvalidArgument,
			fmt.Errorf("the requested username is a protected user, choose a different username"),
			apierrors.NewErrorInfo(commonv1alpha1.Reason_REASON_INVALID_INPUT.String()),
			apierrors.NewBadRequest(&errdetails.BadRequest_FieldViolation{
				Field:       "user.name",
				Description: "User name is a protected user name. Choose a different name.",
			}),
		)
	}

	// 3. List users to check if the requested user exists. The Redpanda admin API
	// always returns ok, regardless whether the user exists or not.
	listedUsers, err := s.redpandaSvc.ListUsers(ctx)
	if err != nil {
		return nil, apierrors.NewConnectError(
			connect.CodeInternal,
			err,
			apierrors.NewErrorInfo(v1alpha1.Reason_REASON_REDPANDA_ADMIN_API_ERROR.String()),
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
			apierrors.NewErrorInfo(commonv1alpha1.Reason_REASON_RESOURCE_NOT_FOUND.String()),
		)
	}

	// 4. Delete user
	err = s.redpandaSvc.DeleteUser(ctx, req.Msg.Name)
	if err != nil {
		return nil, apierrors.NewConnectError(
			connect.CodeInternal,
			err,
			apierrors.NewErrorInfo(v1alpha1.Reason_REASON_REDPANDA_ADMIN_API_ERROR.String()),
		)
	}

	return connect.NewResponse(&v1alpha1.DeleteUserResponse{}), nil
}
