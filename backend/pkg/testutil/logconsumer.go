// Copyright 2023 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package testutil

import (
	"fmt"

	"github.com/testcontainers/testcontainers-go"
)

// TestContainersLogger is a logger that implements the testcontainers
// logger interface.
type TestContainersLogger struct {
	// LogPrefix is a string that is prefixed for every individual log line.
	LogPrefix string
}

// Accept prints the log to stdout
func (lc TestContainersLogger) Accept(l testcontainers.Log) {
	fmt.Print(lc.LogPrefix + string(l.Content))
}
