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
	"net/http"
	"testing"

	"connectrpc.com/connect"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/twmb/franz-go/pkg/sr"
	"google.golang.org/genproto/googleapis/rpc/errdetails"

	v1 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1"
)

func TestNewConnectErrorFromSchemaRegistryError(t *testing.T) {
	t.Parallel()

	expectedReason := v1.Reason_REASON_REDPANDA_SCHEMA_REGISTRY_ERROR.String()

	testCases := []struct {
		name             string
		err              error
		prefixErrMsg     string
		expectedCode     connect.Code
		expectedErrorMsg string
	}{
		{
			name: "Subject not found error",
			err: &sr.ResponseError{
				StatusCode: http.StatusNotFound,
				ErrorCode:  sr.ErrSubjectNotFound.Code,
				Message:    "Subject not found",
			},
			prefixErrMsg:     "error listing Schema Registry ACLs: ",
			expectedCode:     connect.CodeNotFound,
			expectedErrorMsg: "error listing Schema Registry ACLs: Subject not found",
		},
		{
			name: "Invalid schema error",
			err: &sr.ResponseError{
				StatusCode: http.StatusUnprocessableEntity,
				ErrorCode:  sr.ErrInvalidSchema.Code,
				Message:    "Invalid schema",
			},
			prefixErrMsg:     "error creating Schema Registry ACL: ",
			expectedCode:     connect.CodeInvalidArgument,
			expectedErrorMsg: "error creating Schema Registry ACL: Invalid schema",
		},
		{
			name: "Incompatible schema error",
			err: &sr.ResponseError{
				StatusCode: http.StatusConflict,
				ErrorCode:  sr.ErrIncompatibleSchema.Code,
				Message:    "Schema is incompatible with an earlier schema",
			},
			prefixErrMsg:     "compatibility check failed: ",
			expectedCode:     connect.CodeFailedPrecondition,
			expectedErrorMsg: "compatibility check failed: Schema is incompatible with an earlier schema",
		},
		{
			name:             "Timeout error",
			err:              context.Canceled,
			prefixErrMsg:     "operation failed: ",
			expectedCode:     connect.CodeCanceled,
			expectedErrorMsg: "operation failed: the request to the Schema Registry timed out",
		},
		{
			name:             "Generic error",
			err:              errors.New("network connection failed"),
			prefixErrMsg:     "operation failed: ",
			expectedCode:     connect.CodeInternal,
			expectedErrorMsg: "operation failed: network connection failed",
		},
		// Soft-deleted resources
		{
			name: "Subject soft deleted",
			err: &sr.ResponseError{
				StatusCode: http.StatusNotFound,
				ErrorCode:  sr.ErrSubjectSoftDeleted.Code,
				Message:    "Subject was soft deleted",
			},
			prefixErrMsg:     "failed to get subject: ",
			expectedCode:     connect.CodeNotFound,
			expectedErrorMsg: "failed to get subject: Subject was soft deleted",
		},
		{
			name: "Schema version soft deleted",
			err: &sr.ResponseError{
				StatusCode: http.StatusNotFound,
				ErrorCode:  sr.ErrSchemaVersionSoftDeleted.Code,
				Message:    "Schema version was soft deleted",
			},
			prefixErrMsg:     "failed to get version: ",
			expectedCode:     connect.CodeNotFound,
			expectedErrorMsg: "failed to get version: Schema version was soft deleted",
		},
		{
			name: "Subject level mode not configured",
			err: &sr.ResponseError{
				StatusCode: http.StatusNotFound,
				ErrorCode:  sr.ErrSubjectLevelModeNotConfigured.Code,
				Message:    "Subject does not have subject-level mode configured",
			},
			prefixErrMsg:     "failed to get mode: ",
			expectedCode:     connect.CodeNotFound,
			expectedErrorMsg: "failed to get mode: Subject does not have subject-level mode configured",
		},
		// Constraint violations
		{
			name: "Reference exists",
			err: &sr.ResponseError{
				StatusCode: http.StatusUnprocessableEntity,
				ErrorCode:  sr.ErrReferenceExists.Code,
				Message:    "Schema reference already exists",
			},
			prefixErrMsg:     "failed to delete schema: ",
			expectedCode:     connect.CodeFailedPrecondition,
			expectedErrorMsg: "failed to delete schema: Schema reference already exists",
		},
		// Invalid input errors
		{
			name: "Schema too large",
			err: &sr.ResponseError{
				StatusCode: http.StatusUnprocessableEntity,
				ErrorCode:  sr.ErrSchemaTooLarge.Code,
				Message:    "Schema is too large",
			},
			prefixErrMsg:     "failed to register schema: ",
			expectedCode:     connect.CodeInvalidArgument,
			expectedErrorMsg: "failed to register schema: Schema is too large",
		},
		{
			name: "Invalid ruleset",
			err: &sr.ResponseError{
				StatusCode: http.StatusUnprocessableEntity,
				ErrorCode:  sr.ErrInvalidRuleset.Code,
				Message:    "Ruleset is invalid",
			},
			prefixErrMsg:     "failed to register schema: ",
			expectedCode:     connect.CodeInvalidArgument,
			expectedErrorMsg: "failed to register schema: Ruleset is invalid",
		},
		{
			name: "Invalid mode",
			err: &sr.ResponseError{
				StatusCode: http.StatusUnprocessableEntity,
				ErrorCode:  sr.ErrInvalidMode.Code,
				Message:    "Mode is invalid",
			},
			prefixErrMsg:     "failed to set mode: ",
			expectedCode:     connect.CodeInvalidArgument,
			expectedErrorMsg: "failed to set mode: Mode is invalid",
		},
		// State constraint
		{
			name: "Operation not permitted",
			err: &sr.ResponseError{
				StatusCode: http.StatusUnprocessableEntity,
				ErrorCode:  sr.ErrOperationNotPermitted.Code,
				Message:    "Operation is not permitted",
			},
			prefixErrMsg:     "operation failed: ",
			expectedCode:     connect.CodeFailedPrecondition,
			expectedErrorMsg: "operation failed: Operation is not permitted",
		},
		// Leader unavailable
		{
			name: "Unknown leader",
			err: &sr.ResponseError{
				StatusCode: http.StatusInternalServerError,
				ErrorCode:  sr.ErrUnknownLeader.Code,
				Message:    "Leader is unknown",
			},
			prefixErrMsg:     "operation failed: ",
			expectedCode:     connect.CodeUnavailable,
			expectedErrorMsg: "operation failed: Leader is unknown",
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			connectErr := NewConnectErrorFromSchemaRegistryError(tc.err, tc.prefixErrMsg)

			assert.Equal(t, tc.expectedCode, connectErr.Code(), "wrong connect code")
			assert.Equal(t, tc.expectedErrorMsg, connectErr.Message(), "wrong error message")

			details := connectErr.Details()
			require.NotEmpty(t, details, "expected error details")

			var errorInfo *errdetails.ErrorInfo
			for _, detail := range details {
				val, err := detail.Value()
				require.NoError(t, err)
				if ei, ok := val.(*errdetails.ErrorInfo); ok {
					errorInfo = ei
					break
				}
			}
			require.NotNil(t, errorInfo, "expected an ErrorInfo detail")
			assert.Equal(t, expectedReason, errorInfo.Reason, "wrong ErrorInfo reason")

			var srErr *sr.ResponseError
			if errors.As(tc.err, &srErr) {
				assert.Contains(t, errorInfo.Metadata, "sr_error_code")
				assert.Contains(t, errorInfo.Metadata, "sr_http_status_code")
				assert.Contains(t, errorInfo.Metadata, "sr_error_name")
			}
		})
	}
}
