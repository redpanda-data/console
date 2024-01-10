// Copyright 2024 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package topic

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/twmb/franz-go/pkg/kmsg"

	v1alpha1 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1alpha1"
)

func TestDeleteTopicRequestToKafka(t *testing.T) {
	testCases := []struct {
		name       string
		input      *v1alpha1.DeleteTopicRequest
		validateFn func(t *testing.T, mappingResult kmsg.DeleteTopicsRequest)
	}{
		{
			name: "Test case 1",
			input: &v1alpha1.DeleteTopicRequest{
				Name: "test",
			},
			validateFn: func(t *testing.T, mappingResult kmsg.DeleteTopicsRequest) {
				require.Len(t, mappingResult.TopicNames, 1)
				require.Len(t, mappingResult.Topics, 1)
				assert.Equal(t, "test", mappingResult.TopicNames[0])
				assert.Equal(t, kmsg.StringPtr("test"), mappingResult.Topics[0].Topic)
			},
		},
	}

	kafkaMapper := kafkaClientMapper{}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			out := kafkaMapper.deleteTopicToKmsg(tc.input)
			tc.validateFn(t, out)
		})
	}
}

func TestDescribeTopicConfigsToKafka(t *testing.T) {
	testCases := []struct {
		name       string
		input      *v1alpha1.GetTopicConfigurationsRequest
		validateFn func(t *testing.T, mappingResult kmsg.DescribeConfigsRequest)
	}{
		{
			name: "Describe Topic Configs",
			input: &v1alpha1.GetTopicConfigurationsRequest{
				TopicName: "test-topic",
			},
			validateFn: func(t *testing.T, mappingResult kmsg.DescribeConfigsRequest) {
				require.Len(t, mappingResult.Resources, 1)
				assert.Equal(t, "test-topic", mappingResult.Resources[0].ResourceName)
				assert.Equal(t, kmsg.ConfigResourceTypeTopic, mappingResult.Resources[0].ResourceType)
				assert.Nil(t, mappingResult.Resources[0].ConfigNames)
			},
		},
	}

	kafkaMapper := kafkaClientMapper{}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			out := kafkaMapper.describeTopicConfigsToKafka(tc.input)
			tc.validateFn(t, out)
		})
	}
}
