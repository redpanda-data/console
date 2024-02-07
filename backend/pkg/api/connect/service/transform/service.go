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
	"errors"

	commonv1alpha1 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/common/v1alpha1"

	"connectrpc.com/connect"

	apierrors "github.com/redpanda-data/console/backend/pkg/api/connect/errors"
	"github.com/redpanda-data/console/backend/pkg/config"
	v1alpha1 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1alpha1"
	"github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1alpha1/dataplanev1alpha1connect"
	"github.com/redpanda-data/console/backend/pkg/redpanda"
)

var _ dataplanev1alpha1connect.TransformServiceHandler = (*Service)(nil)

// Service is the implementation of the transform service.
type Service struct {
	cfg         *config.Config
	redpandaSvc *redpanda.Service
}

// ListTransforms lists all the transforms matching the filter deployed to Redpanda
func (s *Service) ListTransforms(ctx context.Context, c *connect.Request[v1alpha1.ListTransformsRequest]) (*connect.Response[v1alpha1.ListTransformsResponse], error) {
	if !s.cfg.Redpanda.AdminAPI.Enabled {
		return nil, apierrors.NewConnectError(
			connect.CodeUnimplemented,
			errors.New("the redpanda admin api must be configured to list transforms"),
			apierrors.NewErrorInfo(v1alpha1.Reason_REASON_FEATURE_NOT_CONFIGURED.String()),
			apierrors.NewHelp(apierrors.NewHelpLinkConsoleReferenceConfig()),
		)
	}

	transforms, err := s.redpandaSvc.ListWasmTransforms(ctx)
	if err != nil {
		return nil, apierrors.NewConnectError(
			connect.CodeInternal,
			err,
			apierrors.NewErrorInfo(v1alpha1.Reason_REASON_REDPANDA_ADMIN_API_ERROR.String()),
		)
	}
	preFilter, err := adminMetadataToProtoMetadata(transforms)
	if err != nil {
		return nil, apierrors.NewConnectError(
			connect.CodeNotFound,
			err,
			apierrors.NewErrorInfo(v1alpha1.Reason_REASON_TYPE_MAPPING_ERROR.String()),
		)
	}

	if c.Msg.GetFilter() == nil || c.Msg.GetFilter().GetName() == "" {
		return &connect.Response[v1alpha1.ListTransformsResponse]{
			Msg: &v1alpha1.ListTransformsResponse{
				Transforms: preFilter,
			},
		}, nil
	}

	transform, err := findTransformByName(preFilter, c.Msg.GetFilter().GetName())
	if err != nil {
		return nil, apierrors.NewConnectError(
			connect.CodeNotFound,
			err,
			apierrors.NewErrorInfo(
				commonv1alpha1.Reason_REASON_RESOURCE_NOT_FOUND.String(),
			))
	}
	return &connect.Response[v1alpha1.ListTransformsResponse]{
		Msg: &v1alpha1.ListTransformsResponse{
			Transforms: []*v1alpha1.TransformMetadata{transform},
		},
	}, nil
}

// GetTransform gets a transform by name
func (s *Service) GetTransform(ctx context.Context, c *connect.Request[v1alpha1.GetTransformRequest]) (*connect.Response[v1alpha1.GetTransformResponse], error) {
	if !s.cfg.Redpanda.AdminAPI.Enabled {
		return nil, apierrors.NewConnectError(
			connect.CodeUnimplemented,
			errors.New("the redpanda admin api must be configured to get a transform"),
			apierrors.NewErrorInfo(v1alpha1.Reason_REASON_REDPANDA_ADMIN_API_ERROR.String()),
			apierrors.NewHelp(apierrors.NewHelpLinkConsoleReferenceConfig()),
		)
	}

	transforms, err := s.redpandaSvc.ListWasmTransforms(ctx)
	if err != nil {
		return nil, apierrors.NewConnectError(
			connect.CodeInternal,
			err,
			apierrors.NewErrorInfo(v1alpha1.Reason_REASON_REDPANDA_ADMIN_API_ERROR.String()),
		)
	}

	tfs, err := adminMetadataToProtoMetadata(transforms)
	if err != nil {
		return nil, apierrors.NewConnectError(
			connect.CodeNotFound,
			err,
			apierrors.NewErrorInfo(v1alpha1.Reason_REASON_TYPE_MAPPING_ERROR.String()),
		)
	}

	transform, err := findExactTransformByName(tfs, c.Msg.Name)
	if err != nil {
		return nil, apierrors.NewConnectError(
			connect.CodeNotFound,
			err,
			apierrors.NewErrorInfo(commonv1alpha1.Reason_REASON_RESOURCE_NOT_FOUND.String()),
		)
	}
	return &connect.Response[v1alpha1.GetTransformResponse]{
		Msg: &v1alpha1.GetTransformResponse{
			Transform: transform,
		},
	}, nil
}

// DeleteTransform deletes a transform by name
func (s *Service) DeleteTransform(ctx context.Context, c *connect.Request[v1alpha1.DeleteTransformRequest]) (*connect.Response[v1alpha1.DeleteTransformResponse], error) {
	if !s.cfg.Redpanda.AdminAPI.Enabled {
		return nil, apierrors.NewConnectError(
			connect.CodeUnimplemented,
			errors.New("the redpanda admin api must be configured to get a transform"),
			apierrors.NewErrorInfo(v1alpha1.Reason_REASON_FEATURE_NOT_CONFIGURED.String()),
			apierrors.NewHelp(apierrors.NewHelpLinkConsoleReferenceConfig()),
		)
	}

	transforms, err := s.redpandaSvc.ListWasmTransforms(ctx)
	if err != nil {
		return nil, apierrors.NewConnectError(
			connect.CodeInternal,
			err,
			apierrors.NewErrorInfo(v1alpha1.Reason_REASON_REDPANDA_ADMIN_API_ERROR.String()),
		)
	}

	tfs, err := adminMetadataToProtoMetadata(transforms)
	if err != nil {
		return nil, apierrors.NewConnectError(
			connect.CodeNotFound,
			err,
			apierrors.NewErrorInfo(v1alpha1.Reason_REASON_TYPE_MAPPING_ERROR.String()),
		)
	}

	transform, err := findExactTransformByName(tfs, c.Msg.Name)
	if err != nil {
		return nil, apierrors.NewConnectError(
			connect.CodeNotFound,
			err,
			apierrors.NewErrorInfo(commonv1alpha1.Reason_REASON_RESOURCE_NOT_FOUND.String()),
		)
	}

	if err := s.redpandaSvc.DeleteWasmTransform(ctx, transform.Name); err != nil {
		return nil, apierrors.NewConnectError(
			connect.CodeInternal,
			err,
			apierrors.NewErrorInfo(v1alpha1.Reason_REASON_REDPANDA_ADMIN_API_ERROR.String()),
		)
	}

	return &connect.Response[v1alpha1.DeleteTransformResponse]{
		Msg: &v1alpha1.DeleteTransformResponse{},
	}, nil
}

// NewService creates a new transform service handler.
func NewService(cfg *config.Config,
	redpandaSvc *redpanda.Service,
) *Service {
	return &Service{
		cfg:         cfg,
		redpandaSvc: redpandaSvc,
	}
}
