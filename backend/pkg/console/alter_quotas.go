package console

import (
	"context"
	"github.com/twmb/franz-go/pkg/kmsg"
)

func (s *Service) CreateQuotas(ctx context.Context, request kmsg.AlterClientQuotasRequest) error {
	cl, _, err := s.kafkaClientFactory.GetKafkaClient(ctx)
	if err != nil {
		return err
	}

	_, err = request.RequestWith(ctx, cl)

	return err
}

func (s *Service) DeleteQuotas(ctx context.Context, request kmsg.AlterClientQuotasRequest) error {
	cl, _, err := s.kafkaClientFactory.GetKafkaClient(ctx)
	if err != nil {
		return err
	}

	_, err = request.RequestWith(ctx, cl)
	return err
}
