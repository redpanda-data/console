package kafka

import (
	"context"
	"sync"

	"github.com/Shopify/sarama"
	"golang.org/x/sync/errgroup"
)

// ListConsumerGroupOffsets returns the commited group offsets for a single group
func (s *Service) ListConsumerGroupOffsets(group string) (*sarama.OffsetFetchResponse, error) {
	coordinator, err := s.Client.Coordinator(group)
	if err != nil {
		return nil, err
	}

	req := &sarama.OffsetFetchRequest{
		Version:       2,
		ConsumerGroup: group,
	}

	offsets, err := coordinator.FetchOffset(req)
	if err != nil {
		return nil, err
	}

	return offsets, nil
}

// ListConsumerGroupOffsetsBulk returns a map which has the consumer group name as key
func (s *Service) ListConsumerGroupOffsetsBulk(ctx context.Context, groups []string) (map[string]*sarama.OffsetFetchResponse, error) {
	eg, _ := errgroup.WithContext(ctx)

	mutex := sync.Mutex{}
	res := make(map[string]*sarama.OffsetFetchResponse)

	f := func(group string) func() error {
		return func() error {
			offsets, err := s.ListConsumerGroupOffsets(group)
			if err != nil {
				return err
			}

			mutex.Lock()
			res[group] = offsets
			mutex.Unlock()
			return nil
		}
	}

	for _, group := range groups {
		eg.Go(f(group))
	}

	if err := eg.Wait(); err != nil {
		return nil, err
	}

	return res, nil
}
