// Copyright 2022 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package console

import (
	"context"
	"fmt"

	"github.com/twmb/franz-go/pkg/kmsg"
	"github.com/twmb/franz-go/pkg/kversion"
	"go.uber.org/zap"

	"github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/console/v1alpha1/consolev1alpha1connect"
	"github.com/redpanda-data/console/backend/pkg/version"
)

// EndpointCompatibility describes what Console endpoints can be offered to the frontend,
// based on the supported requests of our upstream systems (Kafka, Redpanda, etc).
type EndpointCompatibility struct {
	KafkaClusterVersion string                          `json:"kafkaVersion"`
	Endpoints           []EndpointCompatibilityEndpoint `json:"endpoints"`
}

// EndpointCompatibilityEndpoint describes whether a certain endpoint (e.g. GET /topics)
// is supported or not.
type EndpointCompatibilityEndpoint struct {
	Endpoint    string `json:"endpoint"`
	Method      string `json:"method"`
	IsSupported bool   `json:"isSupported"`
}

// GetEndpointCompatibility requests API versions from brokers in order to figure out what Console endpoints
// can be offered to the frontend. If the broker does not support certain features which are required for a
// Console endpoint we can let the frontend know in advance, so that these features will be rendered as
// disabled.
func (s *Service) GetEndpointCompatibility(ctx context.Context) (EndpointCompatibility, error) {
	cl, _, err := s.kafkaClientFactory.GetKafkaClient(ctx)
	if err != nil {
		return EndpointCompatibility{}, err
	}

	req := kmsg.NewApiVersionsRequest()
	req.ClientSoftwareVersion = version.Version
	req.ClientSoftwareName = "RPConsole"

	versionsRes, err := req.RequestWith(ctx, cl)
	if err != nil {
		return EndpointCompatibility{}, fmt.Errorf("failed to get kafka api version: %w", err)
	}
	versions := kversion.FromApiVersionsResponse(versionsRes)
	clusterVersion := versions.VersionGuess()

	// Required kafka requests per API endpoint
	type endpoint struct {
		URL             string
		Method          string
		Requests        []kmsg.Request
		HasRedpandaAPI  bool
		RedpandaFeature redpandaFeature
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
			URL:      "/api/topics/{topicName}/records",
			Method:   "DELETE",
			Requests: []kmsg.Request{&kmsg.DeleteRecordsRequest{}},
		},
		{
			URL:      "/api/consumer-groups/{groupId}",
			Method:   "PATCH",
			Requests: []kmsg.Request{&kmsg.OffsetCommitRequest{}},
		},
		{
			URL:      "/api/consumer-groups/{groupId}",
			Method:   "DELETE",
			Requests: []kmsg.Request{&kmsg.DeleteGroupsRequest{}},
		},
		{
			URL:      "/api/consumer-groups/{groupId}/offsets",
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
		{
			URL:      "/api/quotas",
			Method:   "GET",
			Requests: []kmsg.Request{&kmsg.DescribeClientQuotasRequest{}},
		},
		{
			URL:            "/api/users",
			Method:         "GET",
			Requests:       []kmsg.Request{&kmsg.DescribeUserSCRAMCredentialsRequest{}},
			HasRedpandaAPI: true,
		},
		{
			URL:            "/api/users",
			Method:         "POST",
			Requests:       []kmsg.Request{&kmsg.AlterUserSCRAMCredentialsRequest{}},
			HasRedpandaAPI: true,
		},
		{
			URL:            "/api/users",
			Method:         "DELETE",
			Requests:       []kmsg.Request{&kmsg.AlterUserSCRAMCredentialsRequest{}},
			HasRedpandaAPI: true,
		},
		{
			URL:             consolev1alpha1connect.TransformServiceName,
			Method:          "POST",
			HasRedpandaAPI:  true,
			RedpandaFeature: redpandaFeatureWASMDataTransforms,
		},
		{
			URL:             consolev1alpha1connect.DebugBundleServiceName,
			Method:          "POST",
			HasRedpandaAPI:  true,
			RedpandaFeature: redpandaFeatureDebugBundle,
		},
	}

	endpoints := make([]EndpointCompatibilityEndpoint, 0, len(endpointRequirements))
	for _, endpointReq := range endpointRequirements {
		endpointSupported := true

		if len(endpointReq.Requests) == 0 {
			// not a Kafka API endpoint
			// it requires Redpanda Admin API only
			// default it to false
			endpointSupported = false
		}

		for _, req := range endpointReq.Requests {
			_, isSupported := versions.LookupMaxKeyVersion(req.Key())
			if !isSupported {
				endpointSupported = false
			}
		}

		// Some API endpoints may be controllable via the Redpanda Admin API
		// and the Kafka API. If the Kafka API is not supported, but the same
		// endpoint is exposed via the Redpanda Admin API, we support
		// this feature anyways.
		if endpointReq.HasRedpandaAPI && s.cfg.Redpanda.AdminAPI.Enabled {
			endpointSupported = true

			// If we have an actual feature defined that we can check explicitly
			// lets check that specific feature.
			if endpointReq.RedpandaFeature != "" {
				adminAPICl, err := s.redpandaClientFactory.GetRedpandaAPIClient(ctx)
				if err == nil {
					endpointSupported = s.checkRedpandaFeature(ctx, adminAPICl, endpointReq.RedpandaFeature)
				} else {
					endpointSupported = false
					s.logger.Warn("failed to retrieve a redpanda api client to check endpoint compatibility", zap.Error(err))
				}
			}
		}

		endpoints = append(endpoints, EndpointCompatibilityEndpoint{
			Endpoint:    endpointReq.URL,
			Method:      endpointReq.Method,
			IsSupported: endpointSupported,
		})
	}

	// OSS defaults
	endpoints = append(endpoints, EndpointCompatibilityEndpoint{
		Endpoint:    consolev1alpha1connect.PipelineServiceName,
		Method:      "POST",
		IsSupported: false,
	})

	return EndpointCompatibility{
		KafkaClusterVersion: clusterVersion,
		Endpoints:           endpoints,
	}, nil
}
