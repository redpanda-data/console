// Copyright 2025 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package errors

import (
	"context"
	"errors"
	"fmt"
	"strconv"

	"connectrpc.com/connect"
	"github.com/twmb/franz-go/pkg/sr"

	v1 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1"
)

// NewConnectErrorFromSchemaRegistryError enhances error handling by providing
// more insightful connect.Error messages for Schema Registry errors.
func NewConnectErrorFromSchemaRegistryError(err error, prefixErrMsg string) *connect.Error {
	var srErr *sr.ResponseError
	if errors.As(err, &srErr) {
		return NewConnectError(
			codeFromSRError(srErr),
			errors.New(prefixErrMsg+srErr.Error()),
			NewErrorInfo(
				v1.Reason_REASON_REDPANDA_SCHEMA_REGISTRY_ERROR.String(),
				KeyVal{"sr_error_code", strconv.Itoa(srErr.ErrorCode)},
				KeyVal{"sr_error_name", sr.ErrorForCode(srErr.ErrorCode).Name},
				KeyVal{"sr_http_status_code", strconv.Itoa(srErr.StatusCode)},
			),
		)
	}

	// Handle timeout/cancellation errors.
	if errors.Is(err, context.Canceled) {
		return NewConnectError(
			connect.CodeCanceled,
			errors.New(prefixErrMsg+"the request to the Schema Registry timed out"),
			NewErrorInfo(v1.Reason_REASON_REDPANDA_SCHEMA_REGISTRY_ERROR.String()),
		)
	}

	// Fallback.
	return NewConnectError(
		connect.CodeInternal,
		fmt.Errorf("%v%w", prefixErrMsg, err),
		NewErrorInfo(v1.Reason_REASON_REDPANDA_SCHEMA_REGISTRY_ERROR.String()),
	)
}

func codeFromSRError(srErr *sr.ResponseError) connect.Code {
	switch srErr.ErrorCode {
	case sr.ErrSubjectNotFound.Code,
		sr.ErrVersionNotFound.Code,
		sr.ErrSchemaNotFound.Code,
		sr.ErrSubjectLevelCompatibilityNotConfigured.Code,
		sr.ErrSubjectSoftDeleted.Code,
		sr.ErrSchemaVersionSoftDeleted.Code,
		sr.ErrSubjectLevelModeNotConfigured.Code:
		return connect.CodeNotFound

	case sr.ErrInvalidSchema.Code,
		sr.ErrInvalidVersion.Code,
		sr.ErrInvalidCompatibilityLevel.Code,
		sr.ErrInvalidSubject.Code,
		sr.ErrSchemaTooLarge.Code,
		sr.ErrInvalidRuleset.Code,
		sr.ErrInvalidMode.Code:
		return connect.CodeInvalidArgument

	case sr.ErrIncompatibleSchema.Code,
		sr.ErrReferenceExists.Code,
		sr.ErrOperationNotPermitted.Code:
		return connect.CodeFailedPrecondition

	case sr.ErrRequestForwardingFailed.Code,
		sr.ErrOperationTimeout.Code,
		sr.ErrUnknownLeader.Code:
		return connect.CodeUnavailable

	case sr.ErrStoreError.Code:
		return connect.CodeInternal

	default:
		return CodeFromHTTPStatus(srErr.StatusCode)
	}
}
