// Copyright 2024 Redpanda Data, Inc.
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
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"testing"

	"connectrpc.com/connect"
	"github.com/google/go-cmp/cmp"
	adminapi "github.com/redpanda-data/common-go/rpadmin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.uber.org/mock/gomock"
	"google.golang.org/protobuf/testing/protocmp"

	v1alpha1 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1alpha1"
)

// Define the test cases
func TestNewConnectErrorFromRedpandaAdminAPIError(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	tests := []struct {
		name           string
		inputError     error
		inputMsgPrefix string
		expectedResult *connect.Error
	}{
		{
			name: "HTTPResponseError with undecodable body",
			inputError: func() error {
				return &adminapi.HTTPResponseError{
					Method: http.MethodGet,
					URL:    "http://localhost",
					Response: &http.Response{
						StatusCode: http.StatusInternalServerError,
					},
					Body: []byte("mock error message"),
				}
			}(),
			inputMsgPrefix: "",
			expectedResult: NewConnectError(
				CodeFromHTTPStatus(http.StatusInternalServerError),
				// Same error as given is expected to be wrapped
				adminapi.HTTPResponseError{
					Method: http.MethodGet,
					URL:    "http://localhost",
					Response: &http.Response{
						StatusCode: http.StatusInternalServerError,
					},
					Body: []byte("mock error message"),
				},
				NewErrorInfo(
					v1alpha1.Reason_REASON_REDPANDA_ADMIN_API_ERROR.String(),
					KeyVal{
						Key:   "adminapi_status_code",
						Value: strconv.Itoa(http.StatusInternalServerError),
					},
				),
			),
		},
		{
			name: "HTTPResponseError with decodable body",
			inputError: func() error {
				responseBody := &adminapi.GenericErrorBody{
					Message: "decoded message",
					Code:    http.StatusNotFound,
				}
				body, err := json.Marshal(responseBody)
				require.NoError(t, err)

				return &adminapi.HTTPResponseError{
					Method: http.MethodGet,
					URL:    "http://localhost",
					Response: &http.Response{
						StatusCode: http.StatusNotFound,
					},
					Body: body,
				}
			}(),
			inputMsgPrefix: "",
			expectedResult: NewConnectError(
				connect.CodeNotFound,
				errors.New("decoded message"),
				NewErrorInfo(
					v1alpha1.Reason_REASON_REDPANDA_ADMIN_API_ERROR.String(),
					KeyVal{
						Key:   "adminapi_status_code",
						Value: strconv.Itoa(http.StatusNotFound),
					},
				),
			),
		},
		{
			name: "Context canceled error with prefix",
			inputError: func() error {
				return fmt.Errorf("some random msg with a wrapped cancelled context err: %w", context.Canceled)
			}(),
			inputMsgPrefix: "listing transforms failed: ",
			expectedResult: NewConnectError(
				connect.CodeCanceled,
				errors.New("listing transforms failed: the request to the Redpanda admin API timed out"),
				NewErrorInfo(v1alpha1.Reason_REASON_REDPANDA_ADMIN_API_ERROR.String()),
			),
		},
		{
			name: "Any other error",
			inputError: func() error {
				return fmt.Errorf("some random error message")
			}(),
			inputMsgPrefix: "listing transforms failed: ",
			expectedResult: NewConnectError(
				connect.CodeInternal,
				errors.New("listing transforms failed: some random error message"),
				NewErrorInfo(v1alpha1.Reason_REASON_REDPANDA_ADMIN_API_ERROR.String()),
			),
		},
	}

	// Run the test cases
	for _, tt := range tests {
		t.Run(
			tt.name, func(t *testing.T) {
				result := NewConnectErrorFromRedpandaAdminAPIError(tt.inputError, tt.inputMsgPrefix)

				expected := tt.expectedResult
				assert.Equal(t, expected.Code().String(), result.Code().String())
				assert.Equal(t, expected.Message(), result.Message())
				expectedDetails := expected.Details()
				resultDetails := result.Details()
				require.Equal(t, len(expectedDetails), len(resultDetails))
				for i, detail := range expectedDetails {
					expectedProto, err := detail.Value()
					require.NoError(t, err)
					resultProto, err := resultDetails[i].Value()
					require.NoError(t, err)

					assert.Empty(t, cmp.Diff(expectedProto, resultProto, protocmp.Transform()))
				}
			},
		)
	}
}
