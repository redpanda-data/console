// Copyright 2022 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package console

import (
	"fmt"

	"github.com/redpanda-data/console/backend/pkg/config"
	"github.com/redpanda-data/console/backend/pkg/git"
	"github.com/redpanda-data/console/backend/pkg/kafka"
	"github.com/redpanda-data/console/backend/pkg/redpanda"
	"go.uber.org/zap"
)

// Service offers all methods to serve the responses for the REST API. This usually only involves fetching
// several responses from Kafka concurrently and constructing them so, that they are
type Service struct {
	kafkaSvc    *kafka.Service
	redpandaSvc *redpanda.Service
	gitSvc      *git.Service // Git service can be nil if not configured
	logger      *zap.Logger
}

// NewService for the Console package
func NewService(cfg config.Console, logger *zap.Logger, kafkaSvc *kafka.Service, redpandaSvc *redpanda.Service) (*Service, error) {
	var gitSvc *git.Service
	cfg.TopicDocumentation.Git.AllowedFileExtensions = []string{"md"}
	if cfg.TopicDocumentation.Enabled && cfg.TopicDocumentation.Git.Enabled {
		svc, err := git.NewService(cfg.TopicDocumentation.Git, logger, nil)
		if err != nil {
			return nil, fmt.Errorf("failed to create git service: %w", err)
		}
		gitSvc = svc
	}
	return &Service{
		kafkaSvc:    kafkaSvc,
		redpandaSvc: redpandaSvc,
		gitSvc:      gitSvc,
		logger:      logger,
	}, nil
}

// Start starts all the (background) tasks which are required for this service to work properly. If any of these
// tasks can not be setup an error will be returned which will cause the application to exit.
func (s *Service) Start() error {
	if s.gitSvc == nil {
		return nil
	}
	return s.gitSvc.Start()
}
