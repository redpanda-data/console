package owl

import (
	"context"
	"fmt"
	"github.com/cloudhut/kowl/backend/pkg/git"
	"github.com/cloudhut/kowl/backend/pkg/kafka"
	"go.uber.org/zap"
)

// Service offers all methods to serve the responses for the REST API. This usually only involves fetching
// several responses from Kafka concurrently and constructing them so, that they are
type Service struct {
	kafkaSvc *kafka.Service
	gitSvc   *git.Service // Git service can be nil if not configured
	logger   *zap.Logger
}

// NewService for the Owl package
func NewService(logger *zap.Logger, kafkaSvc *kafka.Service, gitSvc *git.Service) *Service {
	return &Service{
		kafkaSvc: kafkaSvc,
		gitSvc:   gitSvc,
		logger:   logger,
	}
}

// Start starts all the (background) tasks which are required for this service to work properly. If any of these
// tasks can not be setup an error will be returned which will cause the application to exit.
func (s *Service) Start() error {
	return s.startTopicDocumentationSync()
}

func (s *Service) startTopicDocumentationSync() error {
	if s.gitSvc == nil {
		return nil
	}

	if !s.gitSvc.Cfg.TopicDocumentationRepo.Enabled {
		return nil
	}

	err := s.gitSvc.CloneDocumentation(context.Background())
	if err != nil {
		return fmt.Errorf("failed to clone topic documentation repo: %w", err)
	}

	go s.gitSvc.SyncDocumentation()

	return nil
}
