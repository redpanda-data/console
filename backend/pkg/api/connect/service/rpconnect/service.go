// Copyright 2024 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

// Package rpconnect contains the implementation of all Redpanda Connect RPC endpoints.
package rpconnect

import (
	"context"
	"fmt"

	commonv1alpha1 "buf.build/gen/go/redpandadata/common/protocolbuffers/go/redpanda/api/common/v1alpha1"
	"connectrpc.com/connect"
	"go.uber.org/zap"

	apierrors "github.com/redpanda-data/console/backend/pkg/api/connect/errors"
	"github.com/redpanda-data/console/backend/pkg/api/hooks"
	v1alpha1 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/console/v1alpha1"
	"github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/console/v1alpha1/consolev1alpha1connect"
	"github.com/redpanda-data/console/backend/pkg/rpconnect"
)

var _ consolev1alpha1connect.RedpandaConnectServiceHandler = (*Service)(nil)

// Service that implements the RedpandaConnect interface.
type Service struct {
	logger *zap.Logger
	linter *rpconnect.Linter
	hooks  hooks.AuthorizationHooks
	mapper *mapper
}

// NewService initializes a new RedpandaConnect service.
func NewService(logger *zap.Logger, authHooks hooks.AuthorizationHooks) (*Service, error) {
	linter, err := rpconnect.NewLinter()
	if err != nil {
		return nil, fmt.Errorf("failed to create linter: %w", err)
	}

	return &Service{
		logger: logger,
		linter: linter,
		hooks:  authHooks,
		mapper: &mapper{},
	}, nil
}

// LintConfig lints a redpanda connect config.
func (s *Service) LintConfig(ctx context.Context, req *connect.Request[v1alpha1.LintConfigRequest]) (*connect.Response[v1alpha1.LintConfigResponse], error) {
	// This is a dummy check, we only want to ensure that the requester is authenticated.
	canView, restErr := s.hooks.CanViewConnectCluster(ctx, "redpanda")
	err := apierrors.NewPermissionDeniedConnectError(canView, restErr,
		"you are not allowed to call this endpoint",
	)
	if err != nil {
		return nil, err
	}

	yamlCfg := []byte(req.Msg.YamlConfig)
	lints, err := s.linter.LintYAMLConfig(yamlCfg)
	if err != nil {
		return nil, apierrors.NewConnectError(
			connect.CodeInvalidArgument,
			err,
			apierrors.NewErrorInfo(commonv1alpha1.Reason_REASON_INVALID_INPUT.String()),
		)
	}

	res := &v1alpha1.LintConfigResponse{
		Valid: len(lints) == 0,
		Lints: s.mapper.lintsToProto(lints),
	}

	return connect.NewResponse(res), nil
}
