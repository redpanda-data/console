// Copyright 2022 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package kafka

import (
	"context"
	"fmt"
	"github.com/twmb/franz-go/pkg/kerr"
	"github.com/twmb/franz-go/pkg/kmsg"
	"sync"

	"golang.org/x/sync/errgroup"
)

// ListConsumerGroupOffsets returns the committed group offsets for a single group
func (s *Service) ListConsumerGroupOffsets(ctx context.Context, group string) (*kmsg.OffsetFetchResponse, error) {
	req := kmsg.OffsetFetchRequest{
		Group:  group,
		Topics: nil, // Requests all topics for this consumer group
	}
	res, err := req.RequestWith(ctx, s.KafkaClient)
	if err != nil {
		return nil, fmt.Errorf("failed to request group offsets for group '%v': %w", group, err)
	}

	err = kerr.ErrorForCode(res.ErrorCode)
	if err != nil {
		return nil, fmt.Errorf("failed to request group offsets for group '%v'. Inner error: %w", group, err)
	}

	return res, nil
}

// ListConsumerGroupOffsetsBulk returns a map which has the Consumer group name as key
func (s *Service) ListConsumerGroupOffsetsBulk(ctx context.Context, groups []string) (map[string]*kmsg.OffsetFetchResponse, error) {
	eg, _ := errgroup.WithContext(ctx)

	mutex := sync.Mutex{}
	res := make(map[string]*kmsg.OffsetFetchResponse)

	f := func(group string) func() error {
		return func() error {
			offsets, err := s.ListConsumerGroupOffsets(ctx, group)
			if err != nil {
				return err
			}

			mutex.Lock()
			res[group] = offsets
			mutex.Unlock()
			return nil
		}
	}

	for _, group := range groups {
		eg.Go(f(group))
	}

	if err := eg.Wait(); err != nil {
		return nil, err
	}

	return res, nil
}
