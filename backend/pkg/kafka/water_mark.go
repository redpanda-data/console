package kafka

import (
	"fmt"
	"github.com/Shopify/sarama"
	"go.uber.org/zap"
)

// WaterMark is a partitionID along with it's highest and lowest message index
type WaterMark struct {
	PartitionID int32
	Low         int64
	High        int64
}

// WaterMarks returns a map of: partitionID -> *waterMark
func (s *Service) WaterMarks(topic string, partitionIDs []int32) (map[int32]*WaterMark, error) {
	// 1. Generate an OffsetRequest for each topic:partition and bucket it to the leader broker
	brokers := make(map[int32]*sarama.Broker)

	// Create two separate buckets for oldest and newest offset requests grouped by brokerID
	// It requires separate buckets because only one offset can concurrently be queried for the same partition
	oldestReqs := make(map[int32]*sarama.OffsetRequest)
	newestReqs := make(map[int32]*sarama.OffsetRequest)
	for _, partitionID := range partitionIDs {
		broker, err := s.Client.Leader(topic, partitionID)
		if err != nil {
			return nil, err
		}
		id := broker.ID()
		brokers[id] = broker

		// Ensure offset request is initialized for this brokerID
		if _, ok := oldestReqs[id]; !ok {
			oldestReqs[id] = &sarama.OffsetRequest{}
		}
		if _, ok := newestReqs[id]; !ok {
			newestReqs[id] = &sarama.OffsetRequest{}
		}

		oldestReqs[id].AddBlock(topic, partitionID, sarama.OffsetOldest, 1)
		newestReqs[id].AddBlock(topic, partitionID, sarama.OffsetNewest, 1)
	}

	// 2. Fetch offsets in parallel
	type response struct {
		Error      error
		Offsets    *sarama.OffsetResponse
		OffsetType int64 // sarama.OffsetOldest || sarama.OffsetNewest
	}
	ch := make(chan response, len(oldestReqs)+len(newestReqs))

	fetchOffsets := func(b *sarama.Broker, req *sarama.OffsetRequest, offsetType int64) {
		res, err := b.GetAvailableOffsets(req)
		if err != nil {
			ch <- response{Error: err}
			return
		}
		ch <- response{Offsets: res, OffsetType: offsetType}
	}

	for brokerID, req := range oldestReqs {
		go fetchOffsets(brokers[brokerID], req, sarama.OffsetOldest)
	}
	for brokerID, req := range newestReqs {
		go fetchOffsets(brokers[brokerID], req, sarama.OffsetNewest)
	}

	// 3. Process results and construct desired response
	waterMarks := make(map[int32]*WaterMark)

	// Iterate on returned offsets and put them into our response map
	for i := 0; i < cap(ch); i++ {
		r := <-ch
		if r.Error != nil {
			return nil, r.Error
		}

		for _, blockByPartition := range r.Offsets.Blocks {
			for partition, block := range blockByPartition {
				if block.Err != sarama.ErrNoError {
					return nil, block.Err
				}

				if _, ok := waterMarks[partition]; !ok {
					waterMarks[partition] = &WaterMark{PartitionID: partition}
				}
				if r.OffsetType == sarama.OffsetNewest {
					waterMarks[partition].High = block.Offsets[0]
				}
				if r.OffsetType == sarama.OffsetOldest {
					waterMarks[partition].Low = block.Offsets[0]
				}
			}
		}
	}

	return waterMarks, nil
}

// HighWaterMarks returns a nested map of: topic -> partitionID -> high water mark offset of all available partitions
func (s *Service) HighWaterMarks(topicPartitions map[string][]int32) (map[string]map[int32]int64, error) {
	// 1. Generate an OffsetRequest for each topic:partition and bucket it to the leader broker
	brokers := make(map[int32]*sarama.Broker)

	// Create bucket for newest offset requests grouped by brokerID
	reqs := make(map[int32]*sarama.OffsetRequest)
	for topic, partitionIDs := range topicPartitions {
		for _, partitionID := range partitionIDs {
			broker, err := s.Client.Leader(topic, partitionID)
			if err != nil {
				return nil, err
			}
			id := broker.ID()
			brokers[id] = broker

			// Ensure offset request is initialized for this brokerID
			if _, ok := reqs[id]; !ok {
				reqs[id] = &sarama.OffsetRequest{}
			}

			reqs[id].AddBlock(topic, partitionID, sarama.OffsetNewest, 1)
		}
	}

	// 2. Fetch offsets in parallel (for each broker one go routine)
	type response struct {
		Error   error
		Offsets *sarama.OffsetResponse
	}
	ch := make(chan response, len(reqs))

	for brokerID, req := range reqs {
		broker := brokers[brokerID]
		go func(b *sarama.Broker, req *sarama.OffsetRequest) {
			res, err := b.GetAvailableOffsets(req)
			if err != nil {
				ch <- response{Error: err}
				return
			}
			ch <- response{Offsets: res}
		}(broker, req)
	}

	res := make(map[string]map[int32]int64)
	for i := 0; i < len(reqs); i++ {
		r := <-ch
		if r.Error != nil {
			s.Logger.Error("failed to fetch high water marks from broker", zap.Error(r.Error))
			return nil, r.Error
		}

		for topic, block := range r.Offsets.Blocks {
			if _, ok := res[topic]; !ok {
				res[topic] = make(map[int32]int64)
			}
			for partitionID, offset := range block {
				if offset.Err != sarama.ErrNoError {
					s.Logger.Error("failed to fetch high watermarks because offset could not be fetched",
						zap.Int16("sarama_error_code", int16(offset.Err)),
						zap.String("topic_name", topic),
						zap.Int32("partition_id", partitionID))
					return nil, fmt.Errorf("failed to fetch high watermarks because at least one offset could not be fetched")
				}
				// We can not access offset.Offset here, this is a bug in sarama, where they don't read the offset for v2+
				// We must read it from an array which is always set and has the length 1
				res[topic][partitionID] = offset.Offsets[0]
			}
		}
	}

	return res, nil
}
