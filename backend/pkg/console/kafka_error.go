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

type KafkaError struct {
	Code        int16  `json:"code"`
	Message     string `json:"message"`
	Description string `json:"description"`
}

func (e *KafkaError) Error() string {
	return fmt.Sprintf("%s: %s", e.Message, e.Description)
}

func newKafkaError(errCode int16) *KafkaError {
	typedError := kerr.TypedErrorForCode(errCode)
	if typedError == nil {
		return nil
	}

	return &KafkaError{
		Code:        typedError.Code,
		Message:     typedError.Message,
		Description: typedError.Description,
	}
}
