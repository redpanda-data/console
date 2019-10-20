package kafka

import (
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

	return d.Value, nil
}

type waterMark struct {
	PartitionID int32
	Low         int64
	High        int64
}

// waterMarks returns a map of: partitionID -> *waterMark
func (s *Service) waterMarks(topic string, partitionIDs []int32) (map[int32]*waterMark, error) {
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
	waterMarks := make(map[int32]*waterMark)

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
					waterMarks[partition] = &waterMark{PartitionID: partition}
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
