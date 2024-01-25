// Copyright 2023 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package transform

import (
	"context"
	"errors"

	"connectrpc.com/connect"
	"github.com/redpanda-data/redpanda/src/go/rpk/pkg/adminapi"

	apierrors "github.com/redpanda-data/console/backend/pkg/api/connect/errors"
	"github.com/redpanda-data/console/backend/pkg/config"
	v1alpha1 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1alpha1"
	"github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1alpha1/dataplanev1alpha1connect"
	"github.com/redpanda-data/console/backend/pkg/redpanda"
)

var _ dataplanev1alpha1connect.TransformServiceHandler = (*Service)(nil)

type Service struct {
	cfg         *config.Config
	redpandaSvc *redpanda.Service
}

func (s *Service) DeployTransform(ctx context.Context, c *connect.Request[v1alpha1.DeployTransformRequest]) (*connect.Response[v1alpha1.DeployTransformResponse], error) {
	if !s.cfg.Redpanda.AdminAPI.Enabled {
		return nil, apierrors.NewConnectError(
			connect.CodeUnimplemented,
			errors.New("the redpanda admin api must be configured to deploy a transform"),
			apierrors.NewErrorInfo(v1alpha1.Reason_REASON_FEATURE_NOT_CONFIGURED.String()),
			apierrors.NewHelp(apierrors.NewHelpLinkConsoleReferenceConfig()),
		)
	}

	envs := make([]adminapi.EnvironmentVariable, 0, len(c.Msg.Environment))
	for k, v := range c.Msg.Environment {
		envs = append(envs, adminapi.EnvironmentVariable{
			Key:   k,
			Value: v,
		})
	}

	if err := s.redpandaSvc.DeployWasmTransform(ctx, adminapi.TransformMetadata{
		Name:         c.Msg.Name,
		InputTopic:   c.Msg.InputTopicName,
		OutputTopics: c.Msg.OutputTopicNames,
		Status:       nil,
		Environment:  envs,
	}, c.Msg.WasmBinary); err != nil {
		return nil, apierrors.NewConnectError(
			connect.CodeInternal,
			err,
			apierrors.NewErrorInfo(v1alpha1.Reason_REASON_REDPANDA_ADMIN_API_ERROR.String()),
		)
	}

	// is this a real transform, is it just fantasy?
	transforms, err := s.redpandaSvc.ListWasmTransforms(ctx)
	if err != nil {
		return nil, apierrors.NewConnectError(
			connect.CodeInternal,
			err,
			apierrors.NewErrorInfo(v1alpha1.Reason_REASON_REDPANDA_ADMIN_API_ERROR.String()),
		)
	}

	tfs, err := transformsConversion(transforms)
	if err != nil {
		return nil, err
	}

	transform, err := findTransformByName(tfs, c.Msg.Name)
	if err != nil {
		return nil, err
	}

	return &connect.Response[v1alpha1.DeployTransformResponse]{
		Msg: &v1alpha1.DeployTransformResponse{
			Transform: transform,
		},
	}, nil
}

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
	outTransforms, err := transformsConversion(transforms)
	if err != nil {
		return nil, err
	}
	return &connect.Response[v1alpha1.ListTransformsResponse]{
		Msg: &v1alpha1.ListTransformsResponse{
			Transforms: outTransforms,
		},
	}, nil
}

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

	tfs, err := transformsConversion(transforms)
	if err != nil {
		return nil, err
	}

	transform, err := findTransformByName(tfs, c.Msg.Name)
	if err != nil {
		return nil, err
	}
	return &connect.Response[v1alpha1.GetTransformResponse]{
		Msg: &v1alpha1.GetTransformResponse{
			Transform: transform,
		},
	}, nil
}

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

	tfs, err := transformsConversion(transforms)
	if err != nil {
		return nil, err
	}

	transform, err := findTransformByName(tfs, c.Msg.Name)
	if err != nil {
		return nil, err
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
