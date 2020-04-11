package owl

import (
	"github.com/cloudhut/kowl/backend/pkg/kafka"
	"go.uber.org/zap"
)

// Service offers all methods to serve the responses for the REST API. This usually only involves fetching
// serveral responses from Kafka concurrently and constructing them so, that they are
type Service struct {
	kafkaSvc *kafka.Service
	logger   *zap.Logger
}

// NewService for the Owl package
func NewService(kafkaSvc *kafka.Service, logger *zap.Logger) *Service {
	return &Service{
		kafkaSvc: kafkaSvc,
		logger:   logger,
	}
}
