// Copyright 2023 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package errors

import (
	"errors"

	"connectrpc.com/connect"
	"github.com/twmb/franz-go/pkg/kerr"

	v1alpha1 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1alpha1"
)

// NewConnectErrorFromKafkaErrorCode creates a new connect.Error for a given Kafka error code.
// Kafka error codes are described in the franz-go kerr package.
func NewConnectErrorFromKafkaErrorCode(code int16, msg *string) *connect.Error {
	kafkaErr := kerr.ErrorForCode(code)

	errMsg := kafkaErr.Error()
	if msg != nil {
		errMsg = *msg
	}
	return NewConnectError(
		connect.CodeInternal,
		errors.New(errMsg),
		NewErrorInfo(v1alpha1.Reason_REASON_KAFKA_API_ERROR.String(), KeyValsFromKafkaError(kafkaErr)...),
	)
}
