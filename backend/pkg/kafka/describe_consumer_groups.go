package kafka

import (
	"context"
	"github.com/twmb/franz-go/pkg/kmsg"
)

// DescribeConsumerGroups fetches additional information from Kafka about one or more Consumer groups.
// It returns a map where the coordinator BrokerID is the key.
func (s *Service) DescribeConsumerGroups(ctx context.Context, groups []string) (*kmsg.DescribeGroupsResponse, error) {
	req := kmsg.DescribeGroupsRequest{
		Groups:                      groups,
		IncludeAuthorizedOperations: true,
	}

	return req.RequestWith(ctx, s.KafkaClient)
}
