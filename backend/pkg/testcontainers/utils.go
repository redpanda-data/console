// Copyright 2022 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package testcontainers

import (
	"context"
	"fmt"

	"github.com/twmb/franz-go/pkg/kadm"
	"github.com/twmb/franz-go/pkg/kgo"
)

func formatTCPPort(port int) string {
	return fmt.Sprintf("%d:%d/tcp", port, port)
}

// testKafkaConnection tries to connect to the Kafka API. It will verify the connection by trying
// to create a topic. If the connection is successful, the function will return nil.
// The created topic will be deleted afterwards.
func testKafkaConnection(ctx context.Context, kgoOpts ...kgo.Opt) error {
	kClient, err := kgo.NewClient(kgoOpts...)
	if err != nil {
		return fmt.Errorf("failed to create Kafka client: %w", err)
	}

	kAdm := kadm.NewClient(kClient)

	topicName := "__testcontainers_test_kafka_connection"
	createTopicRes, err := kAdm.CreateTopics(ctx, 1, 1, map[string]*string{}, topicName)
	if err != nil {
		return fmt.Errorf("failed to create Kafka topic: %w", err)
	}

	// Check for errors inside the Kafka response
	_, err = createTopicRes.On(topicName, func(res *kadm.CreateTopicResponse) error {
		if res.Err != nil {
			return fmt.Errorf("failed to create Kafka topic, inner Kafka error: %w", res.Err)
		}
		return nil
	})
	if err != nil {
		return err
	}

	// Delete the created topic again
	deleteTopicRes, err := kAdm.DeleteTopics(ctx, topicName)
	if err != nil {
		return fmt.Errorf("failed to delete Kafka topic: %w", err)
	}
	_, err = deleteTopicRes.On(topicName, func(res *kadm.DeleteTopicResponse) error {
		if res.Err != nil {
			return fmt.Errorf("failed to delete Kafka topic, inner Kafka error: %w", res.Err)
		}
		return nil
	})
	if err != nil {
		return err
	}

	return nil
}
