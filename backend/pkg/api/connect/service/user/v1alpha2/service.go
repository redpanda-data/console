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
	"log/slog"
	"net/http"
	"sort"
	"strconv"
	"strings"

	commonv1alpha1 "buf.build/gen/go/redpandadata/common/protocolbuffers/go/redpanda/api/common/v1alpha1"
	"connectrpc.com/connect"
	"github.com/redpanda-data/common-go/api/pagination"

	apierrors "github.com/redpanda-data/console/backend/pkg/api/connect/errors"
	"github.com/redpanda-data/console/backend/pkg/config"
	"github.com/redpanda-data/console/backend/pkg/console"
	redpandafactory "github.com/redpanda-data/console/backend/pkg/factory/redpanda"
	v1alpha2 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1alpha2"
	"github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1alpha2/dataplanev1alpha2connect"
)

var _ dataplanev1alpha2connect.UserServiceHandler = (*Service)(nil)

// Service that implements the UserServiceHandler interface. This includes all
// RPCs to manage Redpanda or Kafka users.
type Service struct {
	cfg                    *config.Config
	logger                 *slog.Logger
	consoleSvc             console.Servicer
	redpandaClientProvider redpandafactory.ClientFactory
	defaulter              defaulter
}

// NewService creates a new user service handler.
func NewService(cfg *config.Config,
	logger *slog.Logger,
	redpandaClientProvider redpandafactory.ClientFactory,
	consoleSvc console.Servicer,
) *Service {
	return &Service{
		cfg:                    cfg,
		logger:                 logger,
		consoleSvc:             consoleSvc,
		redpandaClientProvider: redpandaClientProvider,
		defaulter:              defaulter{},
	}
}

// ListUsers returns a list of all existing users.
func (s *Service) ListUsers(ctx context.Context, req *connect.Request[v1alpha2.ListUsersRequest]) (*connect.Response[v1alpha2.ListUsersResponse], error) {
	s.defaulter.applyListUsersRequest(req.Msg)

	// 1. Try to retrieve a Redpanda Admin API client.
	redpandaCl, err := s.redpandaClientProvider.GetRedpandaAPIClient(ctx)
	if err != nil {
		return nil, err
	}

	// 2. List users
	users, err := redpandaCl.ListUsers(ctx)
	if err != nil {
		return nil, apierrors.NewConnectErrorFromRedpandaAdminAPIError(err, "")
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

	filteredUsers := make([]*v1alpha2.ListUsersResponse_User, 0)
	for _, user := range users {
		// Remove users that do not pass the filter criteria
		if !doesUserPassFilter(user) {
			continue
		}

		filteredUsers = append(filteredUsers, &v1alpha2.ListUsersResponse_User{
			Name: user,
		})
	}

	var nextPageToken string
	if req.Msg.GetPageSize() > 0 {
		// Add pagination
		sort.SliceStable(filteredUsers, func(i, j int) bool {
			return filteredUsers[i].Name < filteredUsers[j].Name
		})
		page, token, err := pagination.SliceToPaginatedWithToken(filteredUsers, int(req.Msg.PageSize), req.Msg.GetPageToken(), "name", func(x *v1alpha2.ListUsersResponse_User) string {
			return x.GetName()
		})
		if err != nil {
			return nil, apierrors.NewConnectError(
				connect.CodeInternal,
				fmt.Errorf("failed to apply pagination: %w", err),
				apierrors.NewErrorInfo(v1alpha2.Reason_REASON_CONSOLE_ERROR.String()),
			)
		}
		filteredUsers = page
		nextPageToken = token
	}

	return connect.NewResponse(&v1alpha2.ListUsersResponse{
		Users:         filteredUsers,
		NextPageToken: nextPageToken,
	}), nil
}

// CreateUser creates a new Redpanda/Kafka user.
func (s *Service) CreateUser(ctx context.Context, req *connect.Request[v1alpha2.CreateUserRequest]) (*connect.Response[v1alpha2.CreateUserResponse], error) {
	// 1. Try to retrieve a Redpanda Admin API client.
	redpandaCl, err := s.redpandaClientProvider.GetRedpandaAPIClient(ctx)
	if err != nil {
		return nil, err
	}

	// 2. Map inputs from proto to admin api
	mechanism, err := saslMechanismToRedpandaAdminAPIString(req.Msg.User.Mechanism)
	if err != nil {
		return nil, apierrors.NewConnectError(
			connect.CodeInternal, // Internal because the mechanism should already be validated
			err,
			apierrors.NewErrorInfo(commonv1alpha1.Reason_REASON_INVALID_INPUT.String()),
		)
	}

	// 3. Create user
	err = redpandaCl.CreateUser(ctx, req.Msg.User.Name, req.Msg.User.Password, mechanism)
	if err != nil {
		return nil, apierrors.NewConnectErrorFromRedpandaAdminAPIError(err, "")
	}

	res := &v1alpha2.CreateUserResponse{
		User: &v1alpha2.CreateUserResponse_User{
			Name:      req.Msg.User.Name,
			Mechanism: &req.Msg.User.Mechanism,
		},
	}
	return connect.NewResponse(res), nil
}

// UpdateUser upserts a new Redpanda/Kafka user. This equals a PUT operation.
func (s *Service) UpdateUser(ctx context.Context, req *connect.Request[v1alpha2.UpdateUserRequest]) (*connect.Response[v1alpha2.UpdateUserResponse], error) {
	// 1. Try to retrieve a Redpanda Admin API client.
	redpandaCl, err := s.redpandaClientProvider.GetRedpandaAPIClient(ctx)
	if err != nil {
		return nil, err
	}

	// 2. Map inputs from proto to admin api
	mechanism, err := saslMechanismToRedpandaAdminAPIString(req.Msg.User.Mechanism)
	if err != nil {
		return nil, apierrors.NewConnectError(
			connect.CodeInternal, // Internal because the mechanism should already be validated
			err,
			apierrors.NewErrorInfo(commonv1alpha1.Reason_REASON_INVALID_INPUT.String()),
		)
	}

	// 3. Update user
	err = redpandaCl.UpdateUser(ctx, req.Msg.User.Name, req.Msg.User.Password, mechanism)
	if err != nil {
		return nil, apierrors.NewConnectErrorFromRedpandaAdminAPIError(err, "")
	}

	return connect.NewResponse(&v1alpha2.UpdateUserResponse{
		User: &v1alpha2.UpdateUserResponse_User{
			Name:      req.Msg.User.Name,
			Mechanism: &req.Msg.User.Mechanism,
		},
	}), nil
}

// DeleteUser deletes an existing Redpanda/Kafka user.
func (s *Service) DeleteUser(ctx context.Context, req *connect.Request[v1alpha2.DeleteUserRequest]) (*connect.Response[v1alpha2.DeleteUserResponse], error) {
	// 1. Try to retrieve a Redpanda Admin API client.
	redpandaCl, err := s.redpandaClientProvider.GetRedpandaAPIClient(ctx)
	if err != nil {
		return nil, err
	}

	// 2. List users to check if the requested user exists. The Redpanda admin API
	// always returns ok, regardless whether the user exists or not.
	listedUsers, err := redpandaCl.ListUsers(ctx)
	if err != nil {
		return nil, apierrors.NewConnectErrorFromRedpandaAdminAPIError(err, "failed to list users: ")
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

	// 3. Delete user
	err = redpandaCl.DeleteUser(ctx, req.Msg.Name)
	if err != nil {
		return nil, apierrors.NewConnectErrorFromRedpandaAdminAPIError(err, "failed to delete user: ")
	}

	connectResponse := connect.NewResponse(&v1alpha2.DeleteUserResponse{})
	connectResponse.Header().Set("x-http-code", strconv.Itoa(http.StatusNoContent))

	return connectResponse, nil
}
