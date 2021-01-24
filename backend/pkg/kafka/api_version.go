package kafka

import (
	"context"
	"github.com/twmb/franz-go/pkg/kmsg"
)

func (s *Service) GetAPIVersions(ctx context.Context) (*kmsg.ApiVersionsResponse, error) {
	req := kmsg.NewApiVersionsRequest()
	req.ClientSoftwareVersion = "NA"
	req.ClientSoftwareName = "Kowl"

	return req.RequestWith(ctx, s.KafkaClient)
}
