package kafka

import (
	"github.com/twmb/franz-go/pkg/kmsg"
	"golang.org/x/net/context"
)

func (s *Service) DescribeQuotas(ctx context.Context) (*kmsg.DescribeClientQuotasResponse, error) {
	r := kmsg.NewDescribeClientQuotasRequest()
	return r.RequestWith(ctx, s.KafkaClient)
}
