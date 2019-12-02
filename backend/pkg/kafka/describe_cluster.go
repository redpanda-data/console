package kafka

import (
	"fmt"

	"github.com/Shopify/sarama"
)

// DescribeCluster returns some generic information about the brokers in the given cluster
func (s *Service) DescribeCluster() (*sarama.MetadataResponse, error) {
	controller, err := s.Client.Controller()
	if err != nil {
		return nil, fmt.Errorf("failed to get cluster controller from client: %w", err)
	}

	req := &sarama.MetadataRequest{
		Version: 1, // Version 1 is required to fetch the ControllerID & RackID
		Topics:  []string{},
	}

	return controller.GetMetadata(req)
}
