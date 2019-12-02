package owl

import (
	"github.com/kafka-owl/kafka-owl/pkg/kafka"
	"go.uber.org/zap"
)

// Service offers all methods to serve the responses for the REST API. This usually only involves fetching
// serveral responses from Kafka concurrently and constructing them so, that they are
type Service struct {
	KafkaSvc *kafka.Service
	Logger   *zap.Logger
}
