package kafka

import (
	"context"
	"fmt"
	"sync"

	"github.com/Shopify/sarama"
	"go.uber.org/zap"
)

// ListConsumerGroups returns an array of consumer group ids
func (s *Service) ListConsumerGroups(ctx context.Context) ([]string, error) {
	// Query all brokers in the cluster in parallel in order to get all Consumer Groups
	brokers := s.Client.Brokers()
	wg := sync.WaitGroup{}
	errCh := make(chan error, len(brokers))
	groupsCh := make(chan string)

	for _, broker := range brokers {
		wg.Add(1)
		go func(b *sarama.Broker, cfg *sarama.Config) {
			defer wg.Done()

			err := b.Open(cfg)
			if err != nil && err != sarama.ErrAlreadyConnected {
				s.Logger.Warn("failed to open broker", zap.Error(err))
			}

			response, err := b.ListGroups(&sarama.ListGroupsRequest{})
			if err != nil {
				errCh <- err
				return
			}
			for groupID := range response.Groups {
				groupsCh <- groupID
			}
		}(broker, s.Client.Config())
	}

	// Close channel when waitgroup is done
	go func() {
		wg.Wait()
		close(groupsCh)
		close(errCh)
	}()

	// Fetch all groupIDs from channels until channels are closed or context is Done
	groupIDs := make([]string, 0)
	for {
		select {
		case group, ok := <-groupsCh:
			if !ok {
				groupsCh = nil
				break
			}
			groupIDs = append(groupIDs, group)
		case err, ok := <-errCh:
			if ok {
				return nil, fmt.Errorf("one of the brokers failed to return a list of consumer groups: %v", err)
			}
		case <-ctx.Done():
			s.Logger.Error("context has been cancelled", zap.String("method", "list_consumer_groups"))
			return nil, fmt.Errorf("context has been cancelled")
		}

		if groupsCh == nil {
			break
		}
	}

	return groupIDs, nil
}
