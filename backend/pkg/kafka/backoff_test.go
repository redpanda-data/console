// Copyright 2023 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package kafka

import (
	"fmt"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

func TestExponentialBackoff(t *testing.T) {
	cases := []struct {
		baseInterval time.Duration
		maxInterval  time.Duration
		multiplier   float64
		attempts     int
		expectedWait time.Duration
	}{
		// 5s base, 2x multiplier
		{5 * time.Second, 60 * time.Second, 2.0, 0, 5 * time.Second},
		{5 * time.Second, 60 * time.Second, 2.0, 1, 10 * time.Second},
		{5 * time.Second, 60 * time.Second, 2.0, 2, 20 * time.Second},
		{5 * time.Second, 60 * time.Second, 2.0, 3, 40 * time.Second},
		{5 * time.Second, 60 * time.Second, 2.0, 4, 60 * time.Second},

		// 1s base, 1.6x multiplier
		{time.Second, 60 * time.Second, 1.6, 0, time.Second},
		{time.Second, 60 * time.Second, 1.6, 1, 1600 * time.Millisecond},
		{time.Second, 60 * time.Second, 1.6, 2, 2560 * time.Millisecond},
		{time.Second, 60 * time.Second, 1.6, 3, 4096 * time.Millisecond},
		{time.Second, 60 * time.Second, 1.6, 4, 6553600000 * time.Nanosecond},
	}

	for _, c := range cases {
		eb := &ExponentialBackoff{
			BaseInterval: c.baseInterval,
			MaxInterval:  c.maxInterval,
			Multiplier:   c.multiplier,
		}

		wait := eb.Backoff(c.attempts)
		assert.Equal(t, c.expectedWait, wait, fmt.Sprintf("Attempt %d", c.attempts))
	}
}
