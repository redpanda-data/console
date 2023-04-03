// Copyright 2023 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package random

import "math/rand"

// IntInRange returns a random number in the range between lo and hi.
func IntInRange(low, hi int) int {
	return low + rand.Intn(hi-low)
}
