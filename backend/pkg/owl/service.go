package owl

import (
	"github.com/kafka-owl/kafka-owl/pkg/kafka"
	"go.uber.org/zap"
)

// Service offers all methods to serve the responses for the REST API. This usually only involves fetching
// serveral responses from Kafka concurrently and constructing them so, that they are
type Service struct {
	kafkaSvc        *kafka.Service
	logger          *zap.Logger
	cfg             *Config
	topicsBlacklist map[string]interface{}
}

// NewService for the Owl package
func NewService(kafkaSvc *kafka.Service, logger *zap.Logger, cfg *Config) *Service {
	topicsBlacklist := make(map[string]interface{}, len(cfg.TopicsBlacklist))

	for _, blTopic := range cfg.TopicsBlacklist {
		topicsBlacklist[blTopic] = nil
	}

	return &Service{
		kafkaSvc:        kafkaSvc,
		logger:          logger,
		cfg:             cfg,
		topicsBlacklist: topicsBlacklist,
	}
}
