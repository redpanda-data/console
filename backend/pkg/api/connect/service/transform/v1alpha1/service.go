// Copyright 2023 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

// Package transform contains the implementation of all Transform endpoints.
package transform

import (
	"context"
	"net/http"
	"strconv"

	"connectrpc.com/connect"

	v1alpha2 "github.com/redpanda-data/console/backend/pkg/api/connect/service/transform/v1alpha2"
	v1alpha1 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1alpha1"
	"github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1alpha1/dataplanev1alpha1connect"
	"github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1alpha2/dataplanev1alpha2connect"
)

var _ dataplanev1alpha1connect.TransformServiceHandler = (*Service)(nil)

// Service is the implementation of the transform service.
type Service struct {
	targetService dataplanev1alpha2connect.TransformServiceHandler
	targetImpl    *v1alpha2.Service
	mapper        mapper
	errorWriter   *connect.ErrorWriter
	defaulter     defaulter
}

// NewService creates a new transform service handler.
func NewService(targetService dataplanev1alpha2connect.TransformServiceHandler) *Service {
	return &Service{
		targetService: targetService,
		targetImpl:    targetService.(*v1alpha2.Service),
		mapper:        mapper{},
		errorWriter:   connect.NewErrorWriter(),
		defaulter:     defaulter{},
	}
}

// ListTransforms lists all the transforms matching the filter deployed to Redpanda
func (s *Service) ListTransforms(ctx context.Context, c *connect.Request[v1alpha1.ListTransformsRequest]) (*connect.Response[v1alpha1.ListTransformsResponse], error) {
	s.defaulter.applyListTransformsRequest(c.Msg)

	pr := s.mapper.v1alpha1ToListTransformsv1alpha2(c.Msg)

	resp, err := s.targetService.ListTransforms(ctx, connect.NewRequest(pr))
	if err != nil {
		return nil, err
	}

	return connect.NewResponse(&v1alpha1.ListTransformsResponse{
		Transforms:    s.mapper.v1alpha2TransformsToV1alpha1(resp.Msg.GetTransforms()),
		NextPageToken: resp.Msg.GetNextPageToken(),
	}), nil
}

// GetTransform gets a transform by name
func (s *Service) GetTransform(ctx context.Context, c *connect.Request[v1alpha1.GetTransformRequest]) (*connect.Response[v1alpha1.GetTransformResponse], error) {
	pr := s.mapper.v1alpha1ToGetTransformv1alpha2(c.Msg)

	resp, err := s.targetService.GetTransform(ctx, connect.NewRequest(pr))
	if err != nil {
		return nil, err
	}

	return connect.NewResponse(&v1alpha1.GetTransformResponse{
		Transform: s.mapper.v1alpha2TransformMetadataToV1alpha1(resp.Msg.GetTransform()),
	}), nil
}

// DeleteTransform deletes a transform by name
func (s *Service) DeleteTransform(ctx context.Context, c *connect.Request[v1alpha1.DeleteTransformRequest]) (*connect.Response[v1alpha1.DeleteTransformResponse], error) {
	pr := s.mapper.v1alpha1ToDeleteTransformv1alpha2(c.Msg)

	_, err := s.targetService.DeleteTransform(ctx, connect.NewRequest(pr))
	if err != nil {
		return nil, err
	}

	connectResponse := connect.NewResponse(&v1alpha1.DeleteTransformResponse{})
	connectResponse.Header().Set("x-http-code", strconv.Itoa(http.StatusNoContent))

	return connectResponse, nil
}
