package kafka

import (
	"fmt"

	"github.com/Shopify/sarama"
)

// LogDir has a map of all LogDirPartition for a single Broker
type LogDir struct {
	BrokerID int32                                `json:"brokerId"`
	LogDirs  map[string]map[int32]LogDirPartition // OuterKey = TopicName; InnerKey = PartitionID
}

// LogDirPartition is the described LogDir for a given partition
type LogDirPartition struct {
	PartitionID int32
	Size        int64
}

// LogDirSizeByBroker returns a map where the BrokerID is the key and the summed bytes of all log dirs of
// the respective broker is the value.
func (s *Service) logDirSizeByBroker() (map[int32]int64, error) {
	dirs, err := s.describeLogDirs()
	if err != nil {
		return nil, err
	}

	sizeByBroker := make(map[int32]int64, len(dirs))
	for brokerID, dir := range dirs {
		for _, topicLogDirs := range dir.LogDirs {
			for _, partitionLogDir := range topicLogDirs {
				sizeByBroker[brokerID] += partitionLogDir.Size
			}
		}
	}

	return sizeByBroker, nil
}

// LogDirSizeByTopic returns a map where the Topicname is the key and the summed bytes of all log dirs of
// the respective topic is the value.
func (s *Service) logDirSizeByTopic() (map[string]int64, error) {
	dirs, err := s.describeLogDirs()
	if err != nil {
		return nil, err
	}

	sizeByTopic := make(map[string]int64)
	for _, dir := range dirs {
		for topicName, topicLogDirs := range dir.LogDirs {
			for _, partitionLogDir := range topicLogDirs {
				sizeByTopic[topicName] += partitionLogDir.Size
			}
		}
	}

	return sizeByTopic, nil
}

// DescribeLogDirs concurrently fetches LogDirs from all Brokers and returns them in a map
// where the BrokerID is the key.
func (s *Service) describeLogDirs() (map[int32]LogDir, error) {
	// 1. Fetch Log Dirs from all brokers
	req := &sarama.DescribeLogDirsRequest{}
	brokers := s.Client.Brokers()

	type response struct {
		BrokerID int32
		Res      *sarama.DescribeLogDirsResponse
		Err      error
	}
	resCh := make(chan response, len(brokers))
	for _, broker := range brokers {
		go func(b *sarama.Broker) {
			res, err := b.DescribeLogDirs(req)
			resCh <- response{
				BrokerID: b.ID(),
				Res:      res,
				Err:      err,
			}
		}(broker)
	}

	// 2. Put log dir responses into a structured map as they arrive
	result := make(map[int32]LogDir)
	for i := 0; i < len(brokers); i++ {
		r := <-resCh
		if r.Err != nil {
			return nil, r.Err
		}

		// Collect all LogDirPartition for this Broker
		brokerID := r.BrokerID
		brokerDirs := LogDir{
			BrokerID: brokerID,
			LogDirs:  make(map[string]map[int32]LogDirPartition),
		}
		for _, dir := range r.Res.LogDirs {
			if dir.ErrorCode != sarama.ErrNoError {
				return nil, fmt.Errorf("LogDir request has failed with error code '%v' - %s", dir.ErrorCode, dir.ErrorCode.Error())
			}

			for _, topic := range dir.Topics {
				partitionDirs := make(map[int32]LogDirPartition)
				for _, partition := range topic.Partitions {
					partitionDirs[partition.PartitionID] = LogDirPartition{
						PartitionID: partition.PartitionID,
						Size:        partition.Size,
					}
				}
				brokerDirs.LogDirs[topic.Topic] = partitionDirs
			}
		}

		result[brokerID] = brokerDirs
	}

	return result, nil
}
