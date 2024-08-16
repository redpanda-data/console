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
	"net/http"
	"strconv"

	"connectrpc.com/connect"

	v1alpha1 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1alpha1"
	"github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1alpha1/dataplanev1alpha1connect"
	"github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1alpha2/dataplanev1alpha2connect"
)

var _ dataplanev1alpha1connect.UserServiceHandler = (*Service)(nil)

// Service that implements the UserServiceHandler interface. This includes all
// RPCs to manage Redpanda or Kafka users.
type Service struct {
	targetService dataplanev1alpha2connect.UserServiceHandler
	defaulter     defaulter
}

// NewService creates a new user service handler.
func NewService(targetService dataplanev1alpha2connect.UserServiceHandler) *Service {
	return &Service{
		targetService: targetService,
		defaulter:     defaulter{},
	}
}

// ListUsers returns a list of all existing users.
func (s *Service) ListUsers(ctx context.Context, req *connect.Request[v1alpha1.ListUsersRequest]) (*connect.Response[v1alpha1.ListUsersResponse], error) {
	s.defaulter.applyListUsersRequest(req.Msg)

	pr := mapv1alpha1ToListUsersv1alpha2(req.Msg)

	resp, err := s.targetService.ListUsers(ctx, connect.NewRequest(pr))
	if err != nil {
		return nil, err
	}

	return connect.NewResponse(&v1alpha1.ListUsersResponse{
		Users:         mapv1alpha2UsersTov1alpha2(resp.Msg.GetUsers()),
		NextPageToken: resp.Msg.GetNextPageToken(),
	}), nil
}

// CreateUser creates a new Redpanda/Kafka user.
func (s *Service) CreateUser(ctx context.Context, req *connect.Request[v1alpha1.CreateUserRequest]) (*connect.Response[v1alpha1.CreateUserResponse], error) {
	pr := mapv1alpha1ToCreateUserv1alpha2(req.Msg)

	resp, err := s.targetService.CreateUser(ctx, connect.NewRequest(pr))
	if err != nil {
		return nil, err
	}

	res := &v1alpha1.CreateUserResponse{
		User: &v1alpha1.CreateUserResponse_User{
			Name:      resp.Msg.GetUser().GetName(),
			Mechanism: mapv1alpha2SASLMechanismTov1alpha1(resp.Msg.GetUser().Mechanism),
		},
	}
	return connect.NewResponse(res), nil
}

// UpdateUser upserts a new Redpanda/Kafka user. This equals a PUT operation.
func (s *Service) UpdateUser(ctx context.Context, req *connect.Request[v1alpha1.UpdateUserRequest]) (*connect.Response[v1alpha1.UpdateUserResponse], error) {
	pr := mapv1alpha1ToUpdateUserv1alpha2(req.Msg)

	resp, err := s.targetService.UpdateUser(ctx, connect.NewRequest(pr))
	if err != nil {
		return nil, err
	}

	return connect.NewResponse(&v1alpha1.UpdateUserResponse{
		User: &v1alpha1.UpdateUserResponse_User{
			Name:      resp.Msg.GetUser().GetName(),
			Mechanism: mapv1alpha2SASLMechanismTov1alpha1(resp.Msg.GetUser().Mechanism),
		},
	}), nil
}

// DeleteUser deletes an existing Redpanda/Kafka user.
func (s *Service) DeleteUser(ctx context.Context, req *connect.Request[v1alpha1.DeleteUserRequest]) (*connect.Response[v1alpha1.DeleteUserResponse], error) {
	pr := mapv1alpha1ToDeleteUserv1alpha2(req.Msg)

	_, err := s.targetService.DeleteUser(ctx, connect.NewRequest(pr))
	if err != nil {
		return nil, err
	}

	connectResponse := connect.NewResponse(&v1alpha1.DeleteUserResponse{})
	connectResponse.Header().Set("x-http-code", strconv.Itoa(http.StatusNoContent))

	return connectResponse, nil
}
