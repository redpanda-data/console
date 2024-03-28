// Copyright 2022 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package console

import (
	"fmt"

	"github.com/twmb/franz-go/pkg/kerr"
)

type KafkaErrorWithDynamicMessage struct {
	Static               *kerr.Error
	DynamicServerMessage *string
}

func (e *KafkaErrorWithDynamicMessage) Error() string {
	if e.DynamicServerMessage == nil {
		return e.Static.Error()
	}
	return fmt.Sprintf("%s: %s", e.Static.Message, *e.DynamicServerMessage)
}

// Unwrap returns the original error so that it can be matched using errors.Is().
func (e *KafkaErrorWithDynamicMessage) Unwrap() error {
	return e.Static
}

func newKafkaErrorWithDynamicMessage(code int16, msg *string) error {
	kafkaErr := kerr.TypedErrorForCode(code)
	if kafkaErr == nil {
		return nil
	}
	return &KafkaErrorWithDynamicMessage{Static: kafkaErr, DynamicServerMessage: msg}
}
