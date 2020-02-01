package owl

import (
	"fmt"

	"github.com/Shopify/sarama"
)

// LogDirSizeByBroker returns a map where the BrokerID is the key and the summed bytes of all log dirs of
// the respective broker is the value.
func (s *Service) logDirSizeByBroker() (map[int32]int64, error) {
	responses := s.kafkaSvc.DescribeLogDirs()
	errCount := 0 // todo: return and show in ui

	sizeByBroker := make(map[int32]int64)
	for brokerID, response := range responses {
		if response.Err != nil {
			errCount++
			continue
		}

		for _, dir := range response.LogDirs {
			if dir.ErrorCode != sarama.ErrNoError {
				return nil, fmt.Errorf("log dir request has failed with error code '%v' - %s", dir.ErrorCode, dir.ErrorCode.Error())
			}

			for _, topic := range dir.Topics {
				for _, partition := range topic.Partitions {
					sizeByBroker[brokerID] += partition.Size
				}
			}
		}
	}

	return sizeByBroker, nil
}

// LogDirSizeByTopic returns a map where the Topicname is the key and the summed bytes of all log dirs of
// the respective topic is the value.
func (s *Service) logDirSizeByTopic() (map[string]int64, error) {
	responses := s.kafkaSvc.DescribeLogDirs()
	errCount := 0 // todo: return and show in ui

	sizeByTopic := make(map[string]int64)
	for _, response := range responses {
		if response.Err != nil {
			errCount++
			continue
		}

		for _, dir := range response.LogDirs {
			if dir.ErrorCode != sarama.ErrNoError {
				return nil, fmt.Errorf("log dir request has failed with error code '%v' - %s", dir.ErrorCode, dir.ErrorCode.Error())
			}

			for _, topic := range dir.Topics {
				for _, partition := range topic.Partitions {
					sizeByTopic[topic.Topic] += partition.Size
				}
			}
		}
	}

	return sizeByTopic, nil
}
