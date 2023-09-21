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
}

func NewService(cfg *config.Config, logger *zap.Logger, redpandaSvc *redpanda.Service, consoleSvc console.Servicer) *Service {
	return &Service{
		cfg:         cfg,
		logger:      logger,
		consoleSvc:  consoleSvc,
		redpandaSvc: redpandaSvc,
	}
}

func (s *Service) ListUsers(ctx context.Context, req *connect.Request[v1alpha1.ListUsersRequest]) (*connect.Response[v1alpha1.ListUsersResponse], error) {
	// 1. Check permissions
	// TODO

	// 2. Check if we can list users
	if !s.cfg.Redpanda.AdminAPI.Enabled {
		return nil, apierrors.NewConnectError(
			connect.CodeUnavailable,
			errors.New("the redpanda admin api must be configured to list users"),
			apierrors.NewErrorInfo(apierrors.ReasonFeatureNotConfigured),
			apierrors.NewHelp(apierrors.NewHelpLinkConsoleReferenceConfig()),
		)
	}

	// 3. List users
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
		// TODO: Filter users as defined in hooks
		/*
			if s.hooks.IsProtectedKafkaUser(user) {
				continue
			}*/
		filteredUsers = append(filteredUsers, &v1alpha1.ListUsersResponse_User{
			Name: user,
		})
	}

	return connect.NewResponse(&v1alpha1.ListUsersResponse{
		Users: filteredUsers,
	}), nil
}

func (s *Service) CreateUser(ctx context.Context, req *connect.Request[v1alpha1.CreateUserRequest]) (*connect.Response[v1alpha1.CreateUserResponse], error) {
	// 1. Check permissions
	// TODO: Check if requester is allowed to create users
	// TODO: Check if targeted user is a protected user

	// 2. Check if we can create users
	if !s.cfg.Redpanda.AdminAPI.Enabled {
		return nil, apierrors.NewConnectError(
			connect.CodeUnavailable,
			errors.New("the redpanda admin api must be configured to create users"),
			apierrors.NewErrorInfo(apierrors.ReasonFeatureNotConfigured),
			apierrors.NewHelp(apierrors.NewHelpLinkConsoleReferenceConfig()),
		)
	}

	mechanism, err := saslMechanismToRedpandaAdminAPIString(req.Msg.User.Mechanism)
	if err != nil {
		return nil, apierrors.NewConnectError(
			connect.CodeInternal, // Internal because the mechanism should already be validated
			err,
			apierrors.NewErrorInfo(apierrors.ReasonConsoleError),
		)
	}

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

func (s *Service) UpdateUser(context.Context, *connect.Request[v1alpha1.UpdateUserRequest]) (*connect.Response[v1alpha1.UpdateUserResponse], error) {
	return nil, nil
}

func (s *Service) DeleteUser(context.Context, *connect.Request[v1alpha1.DeleteUserRequest]) (*connect.Response[v1alpha1.DeleteUserResponse], error) {
	return nil, nil
}
