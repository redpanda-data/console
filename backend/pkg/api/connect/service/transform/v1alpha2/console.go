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

	"connectrpc.com/connect"

	v1alpha1 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/console/v1alpha1"
	"github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/console/v1alpha1/consolev1alpha1connect"
	"github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1alpha2/dataplanev1alpha2connect"
)

var _ consolev1alpha1connect.TransformServiceHandler = (*ConsoleService)(nil)

// ConsoleService is the implementation of the transform service.
// This is mainly a wrapper of dataplane API to be used for consumption by the Console frontend.
type ConsoleService struct {
	Impl dataplanev1alpha2connect.TransformServiceHandler
}

// ListTransforms lists the transforms.
func (s *ConsoleService) ListTransforms(ctx context.Context, req *connect.Request[v1alpha1.ListTransformsRequest]) (*connect.Response[v1alpha1.ListTransformsResponse], error) {
	res, err := s.Impl.ListTransforms(ctx, connect.NewRequest(req.Msg.GetRequest()))
	if err != nil {
		return nil, err
	}

	return connect.NewResponse(&v1alpha1.ListTransformsResponse{Response: res.Msg}), nil
}

// GetTransform gets the transform.
func (s *ConsoleService) GetTransform(ctx context.Context, req *connect.Request[v1alpha1.GetTransformRequest]) (*connect.Response[v1alpha1.GetTransformResponse], error) {
	res, err := s.Impl.GetTransform(ctx, connect.NewRequest(req.Msg.GetRequest()))
	if err != nil {
		return nil, err
	}

	return connect.NewResponse(&v1alpha1.GetTransformResponse{Response: res.Msg}), nil
}

// DeleteTransform deletes the transform.
func (s *ConsoleService) DeleteTransform(ctx context.Context, req *connect.Request[v1alpha1.DeleteTransformRequest]) (*connect.Response[v1alpha1.DeleteTransformResponse], error) {
	res, err := s.Impl.DeleteTransform(ctx, connect.NewRequest(req.Msg.GetRequest()))
	if err != nil {
		return nil, err
	}

	return connect.NewResponse(&v1alpha1.DeleteTransformResponse{Response: res.Msg}), nil
}
