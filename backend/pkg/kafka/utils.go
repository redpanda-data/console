package kafka

import (
	"errors"
	"github.com/Shopify/sarama"
	"github.com/twmb/franz-go/pkg/kerr"
	"github.com/twmb/franz-go/pkg/kmsg"
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

func (s *Service) PartitionsToPartitionIDs(partitions []kmsg.MetadataResponseTopicPartition) ([]int32, error) {
	var firstErr error

	partitionIDs := make([]int32, len(partitions))
	for i, partition := range partitions {
		err := kerr.ErrorForCode(partition.ErrorCode)
		if err != nil && firstErr == nil {
			firstErr = err
		} else {
			partitionIDs[i] = partition.Partition
		}
	}

	return partitionIDs, firstErr
}
