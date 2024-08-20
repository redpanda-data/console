// Copyright 2022 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package console

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
