package kafka

import (
	"context"
	"sync"

	"github.com/Shopify/sarama"
	"golang.org/x/sync/errgroup"
)

// DescribeConsumerGroups fetches additional information from Kafka about one or more Consumer groups.
// It returns a map where the coordinator BrokerID is the key.
func (s *Service) DescribeConsumerGroups(ctx context.Context, groups []string) (map[int32]*sarama.DescribeGroupsResponse, error) {
	// 1. Bucket all groupIDs by their respective Consumer group coordinator/broker
	brokersByID := make(map[int32]*sarama.Broker)
	groupsByBrokerID := make(map[int32][]string)
	for _, group := range groups {
		coordinator, err := s.Client.Coordinator(group)
		if err != nil {
			return nil, err
		}

		id := coordinator.ID()
		brokersByID[id] = coordinator
		groupsByBrokerID[id] = append(groupsByBrokerID[id], group)
	}

	// 2. Describe groups in bulk for each broker
	eg, _ := errgroup.WithContext(ctx)
	res := make(map[int32]*sarama.DescribeGroupsResponse, len(groupsByBrokerID))
	mutex := sync.Mutex{}

	f := func(b *sarama.Broker, grps []string) func() error {
		return func() error {
			req := &sarama.DescribeGroupsRequest{Groups: grps}
			r, err := b.DescribeGroups(req)
			if err != nil {
				return err
			}

			for _, groupRes := range r.Groups {
				if groupRes.Err == sarama.ErrNotCoordinatorForConsumer {
					// Asynchronously refresh the group coordinator, this is the only way to purge the cache as of now,
					// as sarama doesn't offer an interface for purging cached coordinator entries... :(
					go s.Client.RefreshCoordinator(groupRes.GroupId)
				}
			}

			mutex.Lock()
			res[b.ID()] = r
			mutex.Unlock()
			return nil
		}
	}

	for id, groups := range groupsByBrokerID {
		b := brokersByID[id]
		eg.Go(f(b, groups))
	}

	if err := eg.Wait(); err != nil {
		return nil, err
	}

	return res, nil
}
