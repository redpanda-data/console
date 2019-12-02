package kafka

import (
	"github.com/Shopify/sarama"
	"go.uber.org/zap"
)

// ListTopics returns a List of all topics in a kafka cluster.
// Each topic entry contains details like ReplicationFactor, Cleanup Policy
func (s *Service) ListTopics() ([]*sarama.TopicMetadata, error) {
	// 1. Connect to random broker
	broker, err := s.findAnyBroker()
	if err != nil {
		return nil, err
	}
	err = broker.Open(s.Client.Config())
	if err != nil && err != sarama.ErrAlreadyConnected {
		s.Logger.Warn("opening the broker connection failed", zap.Error(err))
	}

	// 2. Refresh metadata to ensure we get an up to date list of available topics
	metadata, err := broker.GetMetadata(&sarama.MetadataRequest{Version: 1})
	if err != nil {
		return nil, err
	}

	return metadata.Topics, nil
}
