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
	type response struct {
		Err            error
		GroupsResponse *sarama.ListGroupsResponse
		BrokerID       int32
	}
	resCh := make(chan response, len(brokers))

	for _, broker := range brokers {
		wg.Add(1)
		go func(b *sarama.Broker, cfg *sarama.Config) {
			defer wg.Done()

			err := b.Open(cfg)
			if err != nil && err != sarama.ErrAlreadyConnected {
				s.Logger.Warn("failed to open broker", zap.Error(err))
			}

			r, err := b.ListGroups(&sarama.ListGroupsRequest{})
			if err != nil {
				resCh <- response{
					Err:            err,
					GroupsResponse: nil,
					BrokerID:       b.ID(),
				}
				return
			}
			resCh <- response{
				Err:            nil,
				GroupsResponse: r,
				BrokerID:       b.ID(),
			}
		}(broker, s.Client.Config())
	}

	// Close channel when waitgroup is done
	go func() {
		wg.Wait()
		close(resCh)
	}()

	// Fetch all groupIDs from channels until channels are closed or context is Done
	groupIDs := make([]string, 0)
	for {
		select {
		case res, ok := <-resCh:
			if !ok {
				// If channel has been closed we're done, so let's exit the loop
				goto Exit
			}
			if res.Err != nil {
				return nil, fmt.Errorf("broker with id '%v' failed to return a list of consumer groups: %v", res.BrokerID, res.Err)
			}

			for g := range res.GroupsResponse.Groups {
				groupIDs = append(groupIDs, g)
			}
		case <-ctx.Done():
			s.Logger.Error("context has been cancelled", zap.String("method", "list_consumer_groups"))
			return nil, fmt.Errorf("context has been cancelled")
		}
	}
Exit:

	return groupIDs, nil
}
