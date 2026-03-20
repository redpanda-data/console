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
	"strconv"
	"strings"

	commonv1alpha1 "buf.build/gen/go/redpandadata/common/protocolbuffers/go/redpanda/api/common/v1alpha1"
	"connectrpc.com/connect"
	"github.com/redpanda-data/common-go/api/pagination"
	"github.com/twmb/franz-go/pkg/kadm"
	"github.com/twmb/franz-go/pkg/kerr"

	apierrors "github.com/redpanda-data/console/backend/pkg/api/connect/errors"
	"github.com/redpanda-data/console/backend/pkg/console"
	v1 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1"
	"github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1/dataplanev1connect"
)

var _ dataplanev1connect.UserServiceHandler = (*Service)(nil)

// Service that implements the UserServiceHandler interface. This includes all
// RPCs to manage Redpanda or Kafka users.
type Service struct {
	logger     *slog.Logger
	consoleSvc console.Servicer
	defaulter  defaulter
}

// NewService creates a new user service handler.
func NewService(
	logger *slog.Logger,
	consoleSvc console.Servicer,
) *Service {
	return &Service{
		logger:     logger,
		consoleSvc: consoleSvc,
		defaulter:  defaulter{},
	}
}

// ListUsers returns a list of all existing users.
func (s *Service) ListUsers(ctx context.Context, req *connect.Request[v1.ListUsersRequest]) (*connect.Response[v1.ListUsersResponse], error) {
	s.defaulter.applyListUsersRequest(req.Msg)

	described, err := s.consoleSvc.DescribeUserSCRAMCredentials(ctx)
	if err != nil {
		return nil, apierrors.NewConnectErrorFromKafkaError(err)
	}

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

	// described.Sorted() returns users sorted by name.
	filteredUsers := make([]*v1.ListUsersResponse_User, 0)
	for _, user := range described.Sorted() {
		if user.Err != nil {
			s.logger.WarnContext(ctx, "error describing user SCRAM credentials", slog.String("user", user.User), slog.Any("error", user.Err))
			continue
		}
		if !doesUserPassFilter(user.User) {
			continue
		}
		u := &v1.ListUsersResponse_User{
			Name: user.User,
		}
		if len(user.CredInfos) > 0 {
			u.Mechanism = scramMechanismToProto(user.CredInfos[0].Mechanism)
		}
		filteredUsers = append(filteredUsers, u)
	}

	var nextPageToken string
	if req.Msg.GetPageSize() > 0 {
		// filteredUsers is already sorted by name via described.Sorted().
		page, token, err := pagination.SliceToPaginatedWithToken(filteredUsers, int(req.Msg.PageSize), req.Msg.GetPageToken(), "name", func(x *v1.ListUsersResponse_User) string {
			return x.GetName()
		})
		if err != nil {
			return nil, apierrors.NewConnectError(
				connect.CodeInternal,
				fmt.Errorf("failed to apply pagination: %w", err),
				apierrors.NewErrorInfo(v1.Reason_REASON_CONSOLE_ERROR.String()),
			)
		}
		filteredUsers = page
		nextPageToken = token
	}

	return connect.NewResponse(&v1.ListUsersResponse{
		Users:         filteredUsers,
		NextPageToken: nextPageToken,
	}), nil
}

// CreateUser creates a new Redpanda/Kafka user.
func (s *Service) CreateUser(ctx context.Context, req *connect.Request[v1.CreateUserRequest]) (*connect.Response[v1.CreateUserResponse], error) {
	mechanism, err := saslMechanismToScramMechanism(req.Msg.User.Mechanism)
	if err != nil {
		return nil, apierrors.NewConnectError(
			connect.CodeInternal,
			err,
			apierrors.NewErrorInfo(commonv1alpha1.Reason_REASON_INVALID_INPUT.String()),
		)
	}

	results, err := s.consoleSvc.AlterUserSCRAMs(ctx, nil, []kadm.UpsertSCRAM{{
		User:       req.Msg.User.Name,
		Mechanism:  mechanism,
		Iterations: console.DefaultSCRAMIterations,
		Password:   req.Msg.User.Password,
	}})
	if err != nil {
		return nil, apierrors.NewConnectErrorFromKafkaError(err)
	}

	if result, ok := results[req.Msg.User.Name]; ok && result.Err != nil {
		return nil, apierrors.NewConnectErrorFromKafkaError(result.Err)
	}

	return connect.NewResponse(&v1.CreateUserResponse{
		User: &v1.CreateUserResponse_User{
			Name:      req.Msg.User.Name,
			Mechanism: &req.Msg.User.Mechanism,
		},
	}), nil
}

// UpdateUser upserts a new Redpanda/Kafka user. This equals a PUT operation.
func (s *Service) UpdateUser(ctx context.Context, req *connect.Request[v1.UpdateUserRequest]) (*connect.Response[v1.UpdateUserResponse], error) {
	mechanism, err := saslMechanismToScramMechanism(req.Msg.User.Mechanism)
	if err != nil {
		return nil, apierrors.NewConnectError(
			connect.CodeInternal,
			err,
			apierrors.NewErrorInfo(commonv1alpha1.Reason_REASON_INVALID_INPUT.String()),
		)
	}

	results, err := s.consoleSvc.AlterUserSCRAMs(ctx, nil, []kadm.UpsertSCRAM{{
		User:       req.Msg.User.Name,
		Mechanism:  mechanism,
		Iterations: console.DefaultSCRAMIterations,
		Password:   req.Msg.User.Password,
	}})
	if err != nil {
		return nil, apierrors.NewConnectErrorFromKafkaError(err)
	}

	if result, ok := results[req.Msg.User.Name]; ok && result.Err != nil {
		return nil, apierrors.NewConnectErrorFromKafkaError(result.Err)
	}

	return connect.NewResponse(&v1.UpdateUserResponse{
		User: &v1.UpdateUserResponse_User{
			Name:      req.Msg.User.Name,
			Mechanism: &req.Msg.User.Mechanism,
		},
	}), nil
}

// DeleteUser deletes an existing Redpanda/Kafka user.
func (s *Service) DeleteUser(ctx context.Context, req *connect.Request[v1.DeleteUserRequest]) (*connect.Response[v1.DeleteUserResponse], error) {
	described, err := s.consoleSvc.DescribeUserSCRAMCredentials(ctx, req.Msg.Name)
	if err != nil {
		return nil, apierrors.NewConnectErrorFromKafkaError(err)
	}

	userSCRAM, ok := described[req.Msg.Name]
	switch {
	case !ok || errors.Is(userSCRAM.Err, kerr.ResourceNotFound):
		return nil, apierrors.NewConnectError(
			connect.CodeNotFound,
			errors.New("user not found"),
			apierrors.NewErrorInfo(commonv1alpha1.Reason_REASON_RESOURCE_NOT_FOUND.String()),
		)
	case userSCRAM.Err != nil:
		return nil, apierrors.NewConnectErrorFromKafkaError(userSCRAM.Err)
	case len(userSCRAM.CredInfos) == 0:
		return nil, apierrors.NewConnectError(
			connect.CodeNotFound,
			errors.New("user has no SCRAM credentials"),
			apierrors.NewErrorInfo(commonv1alpha1.Reason_REASON_RESOURCE_NOT_FOUND.String()),
		)
	}

	deletions := make([]kadm.DeleteSCRAM, 0, len(userSCRAM.CredInfos))
	for _, cred := range userSCRAM.CredInfos {
		deletions = append(deletions, kadm.DeleteSCRAM{
			User:      req.Msg.Name,
			Mechanism: cred.Mechanism,
		})
	}

	results, err := s.consoleSvc.AlterUserSCRAMs(ctx, deletions, nil)
	if err != nil {
		return nil, apierrors.NewConnectErrorFromKafkaError(err)
	}

	if result, ok := results[req.Msg.Name]; ok && result.Err != nil {
		return nil, apierrors.NewConnectErrorFromKafkaError(result.Err)
	}

	connectResponse := connect.NewResponse(&v1.DeleteUserResponse{})
	connectResponse.Header().Set("x-http-code", strconv.Itoa(http.StatusNoContent))

	return connectResponse, nil
}
