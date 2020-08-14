package kafka

import (
	"errors"
	"github.com/Shopify/sarama"
)

var (
	brokerIndex = 0
)

func (s *Service) findAnyBroker() (*sarama.Broker, error) {
	brokers := s.Client.Brokers()

	for i := 0; i < len(brokers); i++ {
		brokerIndex++
		actualIndex := brokerIndex % len(brokers)
		broker := brokers[actualIndex]
		isConnected, _ := broker.Connected()
		if isConnected {
			return brokers[actualIndex], nil
		}
	}
	return nil, errors.New("no available broker")
}
