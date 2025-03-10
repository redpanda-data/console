// Copyright 2022 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package console

const (
	// TimestampLatest is the enum that represents a request for the offsets with the most recent timestamp.
	TimestampLatest = -1
	// TimestampEarliest is the enum that represents a request for the offsets with the earliest timestamp.
	TimestampEarliest = -2
)

func derefString(s *string) string {
	if s != nil {
		return *s
	}

	return ""
}

func errorToString(err error) string {
	if err == nil {
		return ""
	}
	return err.Error()
}
