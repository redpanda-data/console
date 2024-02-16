// Copyright 2024 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

//go:build integration

// Package integration includes integration tests for the dataplane API.
package integration

import (
	"context"

	"github.com/twmb/franz-go/pkg/kadm"
)

func createKafkaTopic(ctx context.Context, k *kadm.Client, topic string, partitionCount int) error {
	_, err := k.CreateTopic(ctx, int32(partitionCount), int16(1), map[string]*string{}, topic)
	return err
}

func deleteKafkaTopic(ctx context.Context, k *kadm.Client, topic string) error {
	_, err := k.DeleteTopics(ctx, topic)
	return err
}
