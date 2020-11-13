package owl

import (
	"context"
	"github.com/twmb/franz-go/pkg/kmsg"
	"sort"

	"golang.org/x/sync/errgroup"
)

// ClusterInfo describes the brokers in a cluster
type ClusterInfo struct {
	ControllerID int32     `json:"controllerId"`
	Brokers      []*Broker `json:"brokers"`
}

// Broker described by some basic broker properties
type Broker struct {
	BrokerID   int32   `json:"brokerId"`
	LogDirSize int64   `json:"logDirSize"`
	Address    string  `json:"address"`
	Rack       *string `json:"rack"`
}

// GetClusterInfo returns generic information about all brokers in a Kafka cluster and returns them
func (s *Service) GetClusterInfo(ctx context.Context) (*ClusterInfo, error) {
	eg, _ := errgroup.WithContext(ctx)

	var logDirsByBroker []LogDirsByBroker
	var metadata *kmsg.MetadataResponse

	eg.Go(func() error {
		var err error
		logDirsByBroker, err = s.logDirsByBroker(ctx)
		if err != nil {
			return err
		}
		return nil
	})

	eg.Go(func() error {
		var err error
		metadata, err = s.kafkaSvc.GetMetadata(ctx, nil)
		if err != nil {
			return err
		}
		return nil
	})
	if err := eg.Wait(); err != nil {
		return nil, err
	}

	brokers := make([]*Broker, len(metadata.Brokers))
	for i, broker := range metadata.Brokers {
		size := int64(-1)
		if value, ok := logDirsByBroker[broker.NodeID]; ok {
			size = value
		}

		brokers[i] = &Broker{
			BrokerID:   broker.NodeID,
			LogDirSize: size,
			Address:    broker.Host,
			Rack:       broker.Rack,
		}
	}
	sort.Slice(brokers, func(i, j int) bool {
		return brokers[i].BrokerID < brokers[j].BrokerID
	})

	return &ClusterInfo{
		ControllerID: metadata.ControllerID,
		Brokers:      brokers,
	}, nil
}
