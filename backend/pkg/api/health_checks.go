package api

import (
	"github.com/cloudhut/kafka-owl/pkg/kafka"
)

// KafkaHealthCheck implements the gosundheit HealthCheck interface
type KafkaHealthCheck struct {
	kafkaService *kafka.Service
}

// Execute runs a single time check, and returns an error when the check fails, and an optional details object.
func (k *KafkaHealthCheck) Execute() (interface{}, error) {
	err := k.kafkaService.IsHealthy()
	if err != nil {
		return nil, err
	}

	return nil, nil
}

// Name indicates the probe name
func (k *KafkaHealthCheck) Name() string {
	return "Kafka"
}
