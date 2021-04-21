package owl

import (
	"context"
	"fmt"
	"github.com/twmb/franz-go/pkg/kmsg"
	"github.com/twmb/franz-go/pkg/kversion"
)

type EndpointCompatibility struct {
	KafkaClusterVersion string                          `json:"kafkaVersion"`
	Endpoints           []EndpointCompatibilityEndpoint `json:"endpoints"`
}

type EndpointCompatibilityEndpoint struct {
	Endpoint    string `json:"endpoint"`
	Method      string `json:"method"`
	IsSupported bool   `json:"isSupported"`
}

func (s *Service) GetEndpointCompatibility(ctx context.Context) (EndpointCompatibility, error) {
	versionsRes, err := s.kafkaSvc.GetAPIVersions(ctx)
	if err != nil {
		return EndpointCompatibility{}, fmt.Errorf("failed to get kafka api version: %w", err)
	}
	versions := kversion.FromApiVersionsResponse(versionsRes)
	clusterVersion := versions.VersionGuess()

	// Required kafka requests per API endpoint
	type endpoint struct {
		URL      string
		Method   string
		Requests []kmsg.Request
	}
	endpointRequirements := []endpoint{
		{
			URL:      "/api/cluster/config",
			Method:   "GET",
			Requests: []kmsg.Request{&kmsg.DescribeConfigsRequest{}},
		},
		{
			URL:      "/api/consumer-groups",
			Method:   "GET",
			Requests: []kmsg.Request{&kmsg.DescribeGroupsRequest{}, &kmsg.ListGroupsRequest{}},
		},
		{
			URL:      "/api/consumer-groups/{groupId}",
			Method:   "PATCH",
			Requests: []kmsg.Request{&kmsg.OffsetCommitRequest{}},
		},
		{
			URL:      "/api/consumer-groups/{groupId}",
			Method:   "DELETE",
			Requests: []kmsg.Request{&kmsg.OffsetDeleteRequest{}},
		},
		{
			URL:      "/api/operations/reassign-partitions",
			Method:   "GET",
			Requests: []kmsg.Request{&kmsg.ListPartitionReassignmentsRequest{}},
		},
		{
			URL:      "/api/operations/reassign-partitions",
			Method:   "PATCH",
			Requests: []kmsg.Request{&kmsg.IncrementalAlterConfigsRequest{}, &kmsg.AlterPartitionAssignmentsRequest{}},
		},
	}

	endpoints := make([]EndpointCompatibilityEndpoint, 0, len(endpointRequirements))
	for _, endpointReq := range endpointRequirements {
		endpointSupported := true
		for _, req := range endpointReq.Requests {
			_, isSupported := versions.LookupMaxKeyVersion(req.Key())
			if !isSupported {
				endpointSupported = false
			}
		}

		endpoints = append(endpoints, EndpointCompatibilityEndpoint{
			Endpoint:    endpointReq.URL,
			Method:      endpointReq.Method,
			IsSupported: endpointSupported,
		})
	}

	return EndpointCompatibility{
		KafkaClusterVersion: clusterVersion,
		Endpoints:           endpoints,
	}, nil
}
