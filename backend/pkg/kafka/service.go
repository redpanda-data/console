package kafka

import (
	"github.com/Shopify/sarama"
	"go.uber.org/zap"
)

// Service acts as interface to interact with the Kafka Cluster
type Service struct {
	Client sarama.Client
	Logger *zap.Logger
}
