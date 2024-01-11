// Copyright 2024 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package topic

import (
	"errors"
	"fmt"

	"connectrpc.com/connect"
	"github.com/twmb/franz-go/pkg/kerr"

	apierrors "github.com/redpanda-data/console/backend/pkg/api/connect/errors"
	commonv1alpha1 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/common/v1alpha1"
)

// handleKafkaTopicError handles topic specific error codes, such as UNKNOWN_TOPIC_OR_PARTITION and
// translates these into a connect.Error with more information. If there's no error, nil will
// be returned.
func (*Service) handleKafkaTopicError(kafkaErrorCode int16, errorMessage *string) *connect.Error {
	if kafkaErrorCode == 0 {
		return nil
	}

	kafkaErr := kerr.ErrorForCode(kafkaErrorCode)
	switch {
	case errors.Is(kafkaErr, kerr.UnknownTopicOrPartition):
		return apierrors.NewConnectError(
			connect.CodeNotFound,
			fmt.Errorf("the requested topic does not exist"),
			apierrors.NewErrorInfo(
				commonv1alpha1.Reason_REASON_RESOURCE_NOT_FOUND.String(),
			))
	default:
		return apierrors.NewConnectErrorFromKafkaErrorCode(kafkaErrorCode, errorMessage)
	}
}
