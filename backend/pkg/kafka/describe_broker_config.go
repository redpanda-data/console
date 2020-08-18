package kafka

import (
	"strconv"

	"github.com/Shopify/sarama"
)

// DescribeBrokerConfig fetches config entries which apply at the Broker Scope (e.g. offset.retention.minutes).
// Use an empty array for configNames in order to get all config entries.
func (s *Service) DescribeBrokerConfig(brokerID int32, configNames []string) ([]sarama.ConfigEntry, error) {
	return s.AdminClient.DescribeConfig(sarama.ConfigResource{
		Type:        sarama.BrokerResource,
		Name:        strconv.Itoa(int(brokerID)),
		ConfigNames: configNames,
	})
}
