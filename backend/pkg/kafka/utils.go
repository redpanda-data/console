package kafka

import (
	"errors"
	"math/rand"

	"github.com/Shopify/sarama"
)

func (s *Service) findAnyBroker() (*sarama.Broker, error) {
	brokers := s.Client.Brokers()
	if len(brokers) > 0 {
		index := rand.Intn(len(brokers))
		return brokers[index], nil
	}
	return nil, errors.New("no available broker")
}
