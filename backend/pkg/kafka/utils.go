package kafka

import (
	"errors"
	"math/rand"
	"sync"

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

type waterMark struct {
	PartitionID int32
	Low         int64
	High        int64
}

// waterMarks returns a map of: partitionID -> waterMark
func (s *Service) waterMarks(topicName string, partitionIDs []int32) (map[int32]*waterMark, error) {
	// 1. Generate offset requests for all partitions
	oldestReq := &sarama.OffsetRequest{}
	newestReq := &sarama.OffsetRequest{}
	for _, partitionID := range partitionIDs {
		oldestReq.AddBlock(topicName, partitionID, sarama.OffsetOldest, 1)
		newestReq.AddBlock(topicName, partitionID, sarama.OffsetNewest, 1)
	}

	// 2. Fetch offsets in parallel
	broker, err := s.findAnyBroker()
	if err != nil {
		return nil, err
	}
	offsetResCh := make(chan *sarama.OffsetResponse, 2)
	errCh := make(chan error, 2)
	wg := sync.WaitGroup{}

	fetchOffsets := func(b *sarama.Broker, req *sarama.OffsetRequest) {
		defer wg.Done()
		res, err := b.GetAvailableOffsets(req)
		if err != nil {
			errCh <- err
			return
		}
		offsetResCh <- res
	}

	wg.Add(2)
	go fetchOffsets(broker, oldestReq)
	go fetchOffsets(broker, newestReq)
	wg.Wait()
	close(errCh)
	close(offsetResCh)

	// 3. Process results and construct desired response
	waterMarks := make(map[int32]*waterMark)
	for err := range errCh {
		if err != nil {
			return nil, err
		}
	}

	// Iterate on returned offsets and put them into our response map
	for r := range offsetResCh {
		for _, blockByPartition := range r.Blocks {
			for partition, block := range blockByPartition {
				if block.Err != sarama.ErrNoError {
					return nil, block.Err
				}

				if _, ok := waterMarks[partition]; !ok {
					waterMarks[partition] = &waterMark{PartitionID: partition}
				}
				if block.Offset == sarama.OffsetNewest {
					waterMarks[partition].High = block.Offset
				}
				if block.Offset == sarama.OffsetOldest {
					waterMarks[partition].Low = block.Offset
				}
			}
		}
	}

	return waterMarks, nil
}
