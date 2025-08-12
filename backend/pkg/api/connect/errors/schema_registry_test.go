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
	testCases := []struct {
		name             string
		err              error
		prefixErrMsg     string
		expectedCode     connect.Code
		expectedErrorMsg string
		expectedReason   string
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
			expectedReason:   v1.Reason_REASON_REDPANDA_SCHEMA_REGISTRY_ERROR.String(),
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
			expectedReason:   v1.Reason_REASON_REDPANDA_SCHEMA_REGISTRY_ERROR.String(),
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
			expectedReason:   v1.Reason_REASON_REDPANDA_SCHEMA_REGISTRY_ERROR.String(),
		},
		{
			name:             "Timeout error",
			err:              context.Canceled,
			prefixErrMsg:     "operation failed: ",
			expectedCode:     connect.CodeCanceled,
			expectedErrorMsg: "operation failed: the request to the Schema Registry timed out",
			expectedReason:   v1.Reason_REASON_REDPANDA_SCHEMA_REGISTRY_ERROR.String(),
		},
		{
			name:             "Generic error",
			err:              errors.New("network connection failed"),
			prefixErrMsg:     "operation failed: ",
			expectedCode:     connect.CodeInternal,
			expectedErrorMsg: "operation failed: network connection failed",
			expectedReason:   v1.Reason_REASON_REDPANDA_SCHEMA_REGISTRY_ERROR.String(),
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			connectErr := NewConnectErrorFromSchemaRegistryError(tc.err, tc.prefixErrMsg)

			assert.Equal(t, tc.expectedCode, connectErr.Code(), "Expected connect code to match")
			assert.Equal(t, tc.expectedErrorMsg, connectErr.Message(), "Expected error message to match")

			// Check that the ErrorInfo contains the correct reason
			details := connectErr.Details()
			assert.NotEmpty(t, details, "Expected error details to be present")

			// Verify that the error has the expected reason
			errorInfo := &errdetails.ErrorInfo{}
			for _, detail := range details {
				value, err := detail.Value()
				require.NoError(t, err)
				if errDetails, ok := value.(*errdetails.ErrorInfo); ok && errDetails.Reason == tc.expectedReason {
					errorInfo = errDetails
					break
				}
			}

			require.NotNil(t, errorInfo, "Expected to find ErrorInfo with correct reason")

			var srErr *sr.ResponseError
			if errors.As(tc.err, &srErr) {
				assert.Contains(t, errorInfo.Metadata, "sr_error_code", "Expected sr_error_code in metadata")
				assert.Contains(t, errorInfo.Metadata, "sr_http_status_code", "Expected sr_http_status_code in metadata")
				assert.Contains(t, errorInfo.Metadata, "sr_error_name", "Expected sr_error_name in metadata")
			}
		})
	}
}
