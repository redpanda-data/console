// Copyright 2023 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package serde

import (
	"unicode/utf8"

	"github.com/twmb/franz-go/pkg/kgo"
)

// recordHeaders deserialize Kafka record headers.
func recordHeaders(record *kgo.Record) []RecordHeader {
	headers := make([]RecordHeader, len(record.Headers))
	for i := 0; i < len(record.Headers); i++ {
		encoding := HeaderEncodingNone
		if utf8.Valid(record.Headers[i].Value) {
			encoding = HeaderEncodingUTF8
		} else if record.Headers[i].Value != nil {
			encoding = HeaderEncodingBinary
		}

		headers[i] = RecordHeader{
			Key:      record.Headers[i].Key,
			Value:    record.Headers[i].Value,
			Encoding: encoding,
		}
	}
	return headers
}
