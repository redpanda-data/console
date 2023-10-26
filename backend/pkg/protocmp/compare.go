// Copyright 2023 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

// Package protocmp provides test utilities for comparing protobuf types.
package protocmp

import (
	"testing"

	"github.com/google/go-cmp/cmp"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/testing/protocmp"
)

// AssertProtoEqual compares two protos. Comparison is based on the content of
// the fields. Internal/unexported fields specific to the go implementation of
// protobuf are ignored.
func AssertProtoEqual(t *testing.T, want, got proto.Message) {
	t.Helper()
	if proto.Equal(want, got) {
		return
	}

	if diff := cmp.Diff(want, got, protocmp.Transform()); diff != "" {
		t.Fatalf("not equal (-want +got):\n%s", diff)
	}
}
