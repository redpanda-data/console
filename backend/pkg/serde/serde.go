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

type serdeCfg struct {
	schemaId    uint32
	schemaIDSet bool

	schemaPath string

	index    []int
	indexSet bool

	topic string
}

type (
	// SerdeOpt is an option to configure a Serde.
	SerdeOpt interface{ apply(*serdeCfg) }
	serdeOpt struct{ fn func(*serdeCfg) }
)

func (o serdeOpt) apply(t *serdeCfg) { o.fn(t) }

func WithIndex(index ...int) SerdeOpt {
	return serdeOpt{func(t *serdeCfg) {
		t.index = index
		t.indexSet = true
	}}
}

func WithSchemaID(id uint32) SerdeOpt {
	return serdeOpt{func(t *serdeCfg) {
		t.schemaId = id
		t.schemaIDSet = true
	}}
}

func WithSchemaPath(path string) SerdeOpt {
	return serdeOpt{func(t *serdeCfg) { t.schemaPath = path }}
}

func WithTopic(topic string) SerdeOpt {
	return serdeOpt{func(t *serdeCfg) { t.topic = topic }}
}

type Serde interface {
	// Name returns the serde's display name. The name may be displayed in the frontend
	// for example when troubleshooting is enabled.
	Name() PayloadEncoding

	// DeserializePayload is a method to deserialize either the
	// key or value into our own Record format that can be processed by the
	// Console frontend.
	DeserializePayload(record *kgo.Record, payloadType PayloadType) (RecordPayload, error)

	// For completeness we can define an interface that can be implemented by each Serde so that
	// serialization could also be implemented. These would then be used when we want to produce
	// records via Console. This may be a little trickier to define as the common
	// requirements across all strategies for serializing records are less known. For example
	// some serializers may want to write metadata in Record Headers
	SerializeObject(obj any, payloadType PayloadType, opts ...SerdeOpt) ([]byte, error)
}
