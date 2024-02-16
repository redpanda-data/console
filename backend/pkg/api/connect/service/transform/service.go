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
	"github.com/bufbuild/protovalidate-go"
	"go.uber.org/zap"

	apierrors "github.com/redpanda-data/console/backend/pkg/api/connect/errors"
	"github.com/redpanda-data/console/backend/pkg/config"
	commonv1alpha1 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/common/v1alpha1"
	v1alpha1 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1alpha1"
	"github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1alpha1/dataplanev1alpha1connect"
	"github.com/redpanda-data/console/backend/pkg/redpanda"
)

var _ dataplanev1alpha1connect.TransformServiceHandler = (*Service)(nil)

// Service is the implementation of the transform service.
type Service struct {
	cfg         *config.Config
	logger      *zap.Logger
	redpandaSvc *redpanda.Service
	validator   *protovalidate.Validator
	mapper      mapper
	errorWriter *connect.ErrorWriter
}

// NewService creates a new transform service handler.
func NewService(cfg *config.Config,
	logger *zap.Logger,
	redpandaSvc *redpanda.Service,
	protoValidator *protovalidate.Validator,
) *Service {
	return &Service{
		cfg:         cfg,
		logger:      logger,
		redpandaSvc: redpandaSvc,
		validator:   protoValidator,
		mapper:      mapper{},
		errorWriter: connect.NewErrorWriter(),
	}
}

// writeError writes an error using connect.ErrorWriter and also logs this event.
func (s *Service) writeError(w http.ResponseWriter, r *http.Request, err error) {
	childLogger := s.logger.With(
		zap.String("request_method", r.Method),
		zap.String("request_path", r.URL.Path),
	)

	writeErr := s.errorWriter.Write(w, r, err)
	if writeErr != nil {
		childLogger.Error("failed to write error",
			zap.NamedError("error_to_write", err),
			zap.Error(err))

		w.WriteHeader(http.StatusInternalServerError)
		_, _ = w.Write([]byte(`{"code":"INTERNAL","message":"failed to write error with error writer"}`))
		return
	}
	childLogger.Warn("", zap.Error(err))
}

// ListTransforms lists all the transforms matching the filter deployed to Redpanda
func (s *Service) ListTransforms(ctx context.Context, c *connect.Request[v1alpha1.ListTransformsRequest]) (*connect.Response[v1alpha1.ListTransformsResponse], error) {
	if !s.cfg.Redpanda.AdminAPI.Enabled {
		return nil, apierrors.NewRedpandaAdminAPINotConfiguredError()
	}

	transforms, err := s.redpandaSvc.ListWasmTransforms(ctx)
	if err != nil {
		return nil, apierrors.NewConnectError(
			connect.CodeInternal,
			err,
			apierrors.NewErrorInfo(v1alpha1.Reason_REASON_REDPANDA_ADMIN_API_ERROR.String()),
		)
	}
	transformsProto, err := s.mapper.transformMetadataToProto(transforms)
	if err != nil {
		return nil, apierrors.NewConnectError(
			connect.CodeInternal,
			err,
			apierrors.NewErrorInfo(v1alpha1.Reason_REASON_TYPE_MAPPING_ERROR.String()),
		)
	}

	if c.Msg.GetFilter() == nil || c.Msg.GetFilter().GetName() == "" {
		return &connect.Response[v1alpha1.ListTransformsResponse]{
			Msg: &v1alpha1.ListTransformsResponse{
				Transforms: transformsProto,
			},
		}, nil
	}

	transformsFiltered, err := findTransformByName(transformsProto, c.Msg.GetFilter().GetName())
	if err != nil {
		return nil, apierrors.NewConnectError(
			connect.CodeNotFound,
			err,
			apierrors.NewErrorInfo(commonv1alpha1.Reason_REASON_RESOURCE_NOT_FOUND.String()))
	}
	return &connect.Response[v1alpha1.ListTransformsResponse]{
		Msg: &v1alpha1.ListTransformsResponse{
			Transforms: []*v1alpha1.TransformMetadata{transformsFiltered},
		},
	}, nil
}

// GetTransform gets a transform by name
func (s *Service) GetTransform(ctx context.Context, c *connect.Request[v1alpha1.GetTransformRequest]) (*connect.Response[v1alpha1.GetTransformResponse], error) {
	if !s.cfg.Redpanda.AdminAPI.Enabled {
		return nil, apierrors.NewRedpandaAdminAPINotConfiguredError()
	}

	transforms, err := s.redpandaSvc.ListWasmTransforms(ctx)
	if err != nil {
		return nil, apierrors.NewConnectError(
			connect.CodeInternal,
			err,
			apierrors.NewErrorInfo(v1alpha1.Reason_REASON_REDPANDA_ADMIN_API_ERROR.String()),
		)
	}

	tfs, err := s.mapper.transformMetadataToProto(transforms)
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
		return nil, apierrors.NewRedpandaAdminAPINotConfiguredError()
	}

	transforms, err := s.redpandaSvc.ListWasmTransforms(ctx)
	if err != nil {
		return nil, apierrors.NewConnectError(
			connect.CodeInternal,
			err,
			apierrors.NewErrorInfo(v1alpha1.Reason_REASON_REDPANDA_ADMIN_API_ERROR.String()),
		)
	}

	tfs, err := s.mapper.transformMetadataToProto(transforms)
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

	connectResponse := connect.NewResponse(&v1alpha1.DeleteTransformResponse{})
	connectResponse.Header().Set("x-http-code", strconv.Itoa(http.StatusNoContent))

	return connectResponse, nil
}
