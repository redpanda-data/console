// Copyright 2024 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package testutil

import (
	"context"
	"io"
	"testing"

	"github.com/testcontainers/testcontainers-go"
)

// LogContainerLogsIfFailed prints the container's logs to the test output when
// err is non-nil. This is useful for debugging container startup failures in CI,
// where the only clue is "container exited with code X" but no actual logs.
func LogContainerLogsIfFailed(ctx context.Context, t testing.TB, container testcontainers.Container, err error) {
	t.Helper()

	if err == nil || container == nil {
		return
	}

	rc, logErr := container.Logs(ctx)
	if logErr != nil {
		t.Logf("failed to retrieve container logs after error: %v", logErr)
		return
	}
	defer rc.Close()

	logs, readErr := io.ReadAll(rc)
	if readErr != nil {
		t.Logf("failed to read container logs after error: %v", readErr)
		return
	}

	t.Logf("container logs (startup error: %v):\n%s", err, string(logs))
}
