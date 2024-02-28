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
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"testing"

	"connectrpc.com/connect"
	"github.com/redpanda-data/redpanda/src/go/rpk/pkg/adminapi"
	"github.com/stretchr/testify/assert"

	v1alpha1 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1alpha1"
)

// HTTPResponseErrorInterface abstracts adminapi.HTTPResponseError for mocking.
//
//go:generate mockgen -destination=./mocks/http_response_error.go -package=mocks github.com/redpanda-data/console/backend/pkg/api/connect/errors HTTPResponseErrorInterface
type HTTPResponseErrorInterface interface {
	Error() string
	DecodeGenericErrorBody() (*adminapi.GenericErrorBody, error)
	GetResponse() *http.Response
}

// Define the test cases
func TestNewConnectErrorFromRedpandaAdminAPIError(t *testing.T) {
	tests := []struct {
		name           string
		inputError     error
		expectedResult *connect.Error
	}{
		{
			name: "HTTPResponseError with undecodable body",
			inputError: func() error {
				/*
					mockErr := new(MockHTTPResponseError)
					mockErr.On("Error").Return("mock error message")
					mockErr.Response = &http.Response{StatusCode: http.StatusInternalServerError}
					return mockErr*/
				return nil
			}(),
			expectedResult: NewConnectError(
				CodeFromHTTPStatus(http.StatusInternalServerError),
				errors.New("mock error message"),
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
				/*
					mockErr := new(MockHTTPResponseError)
					mockErr.On("Error").Return("mock error message")
					mockErr.On("DecodeGenericErrorBodyBody").Return(
						&adminapi.GenericErrorBody{
							Message: "decoded message",
							Code:    http.StatusNotFound,
						}, nil,
					)
					mockErr.Response = &http.Response{StatusCode: http.StatusOK}
					return mockErr
				*/
				return nil
			}(),
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
			name: "Context canceled error",
			inputError: func() error {
				return fmt.Errorf("some random msg with a wrapped cancelled context err: %w", context.Canceled)
			}(),
			expectedResult: NewConnectError(
				connect.CodeCanceled,
				errors.New("the request to the Redpanda admin API timed out"),
				NewErrorInfo(v1alpha1.Reason_REASON_REDPANDA_ADMIN_API_ERROR.String()),
			),
		},
	}

	// Run the test cases
	for _, tt := range tests {
		t.Run(
			tt.name, func(t *testing.T) {
				result := NewConnectErrorFromRedpandaAdminAPIError(tt.inputError)
				assert.Equal(t, tt.expectedResult, result)
			},
		)
	}
}
