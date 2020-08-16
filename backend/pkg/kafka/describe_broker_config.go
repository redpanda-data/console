package kafka

import (
	"github.com/Shopify/sarama"
)

// DescribeBrokerConfig fetches config entries which apply at the Broker Scope (e.g. offset.retention.minutes).
// Use an empty array for configNames in order to get all config entries.
func (s *Service) DescribeBrokerConfig(brokerID string, configNames []string) ([]sarama.ConfigEntry, error) {
	return s.AdminClient.DescribeConfig(sarama.ConfigResource{
		Type:        sarama.BrokerResource,
		Name:        brokerID,
		ConfigNames: configNames,
	})
}
