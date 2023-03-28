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
	"math"
	"time"
)

// ExponentialBackoff is a helper struct that can calculate the wait
// time between retries. Each retry increases the wait time exponentially,
// based on the given multiplier.
type ExponentialBackoff struct {
	BaseInterval time.Duration
	MaxInterval  time.Duration
	Multiplier   float64
}

// Backoff returns the duration to wait before retrying.
// Each successive call increases the wait time exponentially.
func (e *ExponentialBackoff) Backoff(attempts int) time.Duration {
	multiplied := math.Pow(e.Multiplier, float64(attempts))
	wait := time.Duration(float64(e.BaseInterval) * multiplied)
	if wait > e.MaxInterval {
		wait = e.MaxInterval
	}
	return wait
}
