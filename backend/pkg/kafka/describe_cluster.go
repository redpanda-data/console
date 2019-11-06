package kafka

import (
	"sort"

	"github.com/Shopify/sarama"
	"go.uber.org/zap"
)

// ClusterInfo describes the brokers in a cluster
type ClusterInfo struct {
	ControllerID int32     `json:"controllerId"`
	Brokers      []*Broker `json:"brokers"`
}

// Broker described by some basic broker properties
type Broker struct {
	BrokerID   int32  `json:"brokerId"`
	LogDirSize int64  `json:"logDirSize"`
	Address    string `json:"address"`
	Rack       string `json:"rack"`
}

// DescribeCluster returns some general information about the brokers in the given cluster
func (s *Service) DescribeCluster() (*ClusterInfo, error) {
	controller, err := s.Client.Controller()
	if err != nil {
		s.Logger.Error("failed to get cluster controller from client", zap.Error(err))
		return nil, err
	}

	req := &sarama.MetadataRequest{
		Version: 1, // Version 1 is required to fetch the ControllerID & RackID
		Topics:  []string{},
	}
	response, err := controller.GetMetadata(req)
	if err != nil {
		s.Logger.Error("failed to get cluster metadata from client", zap.Error(err))
		return nil, err
	}

	sizeByBroker, err := s.logDirSizeByBroker()
	if err != nil {
		return nil, err
	}

	brokers := make([]*Broker, len(response.Brokers))
	for i, broker := range response.Brokers {
		brokers[i] = &Broker{
			BrokerID:   broker.ID(),
			LogDirSize: sizeByBroker[broker.ID()],
			Address:    broker.Addr(),
			Rack:       broker.Rack(),
		}
	}
	sort.Slice(brokers, func(i, j int) bool {
		return brokers[i].BrokerID < brokers[j].BrokerID
	})

	return &ClusterInfo{
		ControllerID: response.ControllerID,
		Brokers:      brokers,
	}, nil
}
