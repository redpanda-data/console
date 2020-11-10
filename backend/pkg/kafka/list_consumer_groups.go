package kafka

import (
	"context"
	"fmt"
	"github.com/Shopify/sarama"
	"golang.org/x/sync/errgroup"
)

type ListConsumerGroupsResponse struct {
	GroupIDs []string
	Errors   []error
}

// ListConsumerGroups returns an array of Consumer group ids. Failed broker requests will be returned in the response.
// If all broker requests fail an error will be returned.
func (s *Service) ListConsumerGroups(ctx context.Context) (*ListConsumerGroupsResponse, error) {
	// 1. Query all brokers in the cluster in parallel in order to get all Consumer Groups
	brokers := s.Client.Brokers()
	type response struct {
		Err            error
		GroupsResponse *sarama.ListGroupsResponse
		BrokerID       int32
	}
	resCh := make(chan response, len(brokers))

	g, ctx := errgroup.WithContext(ctx)
	for _, broker := range brokers {
		// Wrap in a func to avoid race conditions
		func(b *sarama.Broker) {
			g.Go(func() error {
				_ = b.Open(s.Client.Config())
				r, err := b.ListGroups(&sarama.ListGroupsRequest{})
				if err != nil {
					resCh <- response{
						Err:            err,
						GroupsResponse: nil,
						BrokerID:       b.ID(),
					}
					return nil
				}
				resCh <- response{
					Err:            nil,
					GroupsResponse: r,
					BrokerID:       b.ID(),
				}
				return nil
			})
		}(broker)
	}

	// Wait until errgroup is done. We ignore the returned error as we won't ever return an error
	_ = g.Wait()
	close(resCh)

	// Fetch all groupIDs from channels until channels are closed or context is Done
	groupIDs := make([]string, 0)
	errors := make([]error, 0)

	for res := range resCh {
		if res.Err != nil {
			err := fmt.Errorf("broker with id '%v' failed to return a list of Consumer groups: %v", res.BrokerID, res.Err)
			errors = append(errors, err)
			continue
		}

		for g := range res.GroupsResponse.Groups {
			groupIDs = append(groupIDs, g)
		}
	}

	if len(errors) == len(brokers) {
		// All brokers returned an error
		return nil, fmt.Errorf("all brokers failed to return a list of consumer groups: %w", errors[0])
	}

	return &ListConsumerGroupsResponse{
		GroupIDs: groupIDs,
		Errors:   errors,
	}, nil
}
