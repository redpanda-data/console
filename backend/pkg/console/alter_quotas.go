package console

import (
	"context"

	"github.com/twmb/franz-go/pkg/kmsg"
)

// AlterQuotas modifies client quotas in the Kafka cluster.
// This method can be used to both create and delete quotas by setting the Remove field
// in the AlterClientQuotasRequestEntryOp operations:
// - Remove: false - Creates or updates quota values
// - Remove: true  - Deletes existing quota values
func (s *Service) AlterQuotas(ctx context.Context, request kmsg.AlterClientQuotasRequest) error {
	cl, _, err := s.kafkaClientFactory.GetKafkaClient(ctx)
	if err != nil {
		return err
	}

	_, err = request.RequestWith(ctx, cl)
	return err
}
