package kafka

import (
	"encoding/json"
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

// DirectEmbedding consists of a byte array that will be used as-is without any conversion
type DirectEmbedding struct {
	Value     []byte
	ValueType valueType
}

// MarshalJSON implements the 'Marshaller' interface for DirectEmbedding
func (d *DirectEmbedding) MarshalJSON() ([]byte, error) {
	if d.Value == nil || len(d.Value) == 0 {
		return []byte("{}"), nil
	}

	if d.ValueType == valueTypeText || d.ValueType == valueTypeBinary {
		return json.Marshal(string(d.Value))
	}

	return d.Value, nil
}
