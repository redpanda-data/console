// Copyright 2023 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package random

import (
	"crypto/rand"
	"math/big"
)

// IntInRange returns a random number in the range between lo and hi.
func IntInRange(low, hi int) int {
	// Generate 20 random numbers with exclusive max of 100.
	// ... So max value returned is 99.
	//     All values returned are 0 or greater as well.
	result, _ := rand.Int(rand.Reader, big.NewInt(int64(hi-low)))

	return int(result.Int64())
}
