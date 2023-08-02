// Copyright 2023 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package serde

import "github.com/twmb/franz-go/pkg/kgo"

type Serde interface {
	// Name returns the serde's display name. The name may be displayed in the frontend
	// for example when troubleshooting is enabled.
	Name() PayloadEncoding

	// DeserializePayload is a method to deserialize either the
	// key or value into our own Record format that can be processed by the
	// Console frontend.
	DeserializePayload(record *kgo.Record, payloadType payloadType) (RecordPayload, error)

	// For completeness we can define an interface that can be implemented by each Serde so that
	// serialization could also be implemented. These would then be used when we want to produce
	// records via Console. This may be a little trickier to define as the common
	// requirements across all strategies for serializing records are less known. For example
	// some serializers may want to write metadata in Record Headers
	// SerializeObject(obj any)
}
