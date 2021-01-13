package kafka

import (
	"context"
	"github.com/twmb/franz-go/pkg/kmsg"
)

// GetAPIVersions returns the supported Kafka API versions
func (s *Service) GetAPIVersions(ctx context.Context) (*kmsg.ApiVersionsResponse, error) {
	req := kmsg.NewApiVersionsRequest()
	req.ClientSoftwareName = "Kowl"
	req.ClientSoftwareVersion = "na"

	return req.RequestWith(ctx, s.KafkaClient)
}
