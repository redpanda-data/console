// Copyright 2023 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

// Package acl contains all handlers for the ACL endpoints.
package acl

import (
	"context"
	"net/http"
	"strconv"

	"connectrpc.com/connect"

	v1alpha1 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1alpha1"
	"github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1alpha1/dataplanev1alpha1connect"
	"github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1alpha2/dataplanev1alpha2connect"
)

var _ dataplanev1alpha1connect.ACLServiceHandler = (*Service)(nil)

// Service implements the handlers for ACL endpoints.
type Service struct {
	targetService dataplanev1alpha2connect.ACLServiceHandler
	mapper        *apiVersionMapper
	defaulter     *defaulter
}

// NewService creates a new ACL service handler.
func NewService(targetService dataplanev1alpha2connect.ACLServiceHandler) *Service {
	return &Service{
		targetService: targetService,
		mapper:        &apiVersionMapper{},
		defaulter:     &defaulter{},
	}
}

// ListACLs lists all stored ACLs from the target Kafka cluster.
func (s *Service) ListACLs(ctx context.Context, req *connect.Request[v1alpha1.ListACLsRequest]) (*connect.Response[v1alpha1.ListACLsResponse], error) {
	s.defaulter.applyListACLsRequest(req.Msg)

	pr := s.mapper.v1alpha1ToListACLsv1alpha2(req.Msg)

	resp, err := s.targetService.ListACLs(ctx, connect.NewRequest(pr))
	if err != nil {
		return nil, err
	}

	return connect.NewResponse(&v1alpha1.ListACLsResponse{
		Resources: s.mapper.v1alpha2ListACLsResponseResourcesTov1alpha1(resp.Msg.GetResources()),
	}), nil
}

// CreateACL implements the handler for the create ACL endpoint.
func (s *Service) CreateACL(ctx context.Context, req *connect.Request[v1alpha1.CreateACLRequest]) (*connect.Response[v1alpha1.CreateACLResponse], error) {
	s.defaulter.applyCreateACLRequest(req.Msg)

	pr := s.mapper.v1alpha1ToCreateACLv1alpha2(req.Msg)
	_, err := s.targetService.CreateACL(ctx, connect.NewRequest(pr))
	if err != nil {
		return nil, err
	}

	connectResponse := connect.NewResponse(&v1alpha1.CreateACLResponse{})
	connectResponse.Header().Set("x-http-code", strconv.Itoa(http.StatusCreated))

	return connectResponse, nil
}

// DeleteACLs implements the handler for the delete ACL endpoint.
func (s *Service) DeleteACLs(ctx context.Context, req *connect.Request[v1alpha1.DeleteACLsRequest]) (*connect.Response[v1alpha1.DeleteACLsResponse], error) {
	pr := s.mapper.v1alpha1ToDeleteACLv1alpha2(req.Msg)

	resp, err := s.targetService.DeleteACLs(ctx, connect.NewRequest(pr))
	if err != nil {
		return nil, err
	}

	return connect.NewResponse(&v1alpha1.DeleteACLsResponse{
		MatchingAcls: s.mapper.v1alpha2ToDeleteACLsResponseMatchingACLv1alpha1(resp.Msg.GetMatchingAcls()),
	}), nil
}
