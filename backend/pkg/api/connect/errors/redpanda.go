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
	"net/http"
	"strconv"

	"connectrpc.com/connect"
	"github.com/redpanda-data/redpanda/src/go/rpk/pkg/adminapi"

	v1alpha1 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1alpha1"
)

// NewConnectErrorFromRedpandaAdminAPIError enhances error handling by providing
// more insightful connect.Error messages to users. It unwraps errors from the
// Redpanda Admin API, allowing for better feedback. It decodes HTTP response
// errors, extracts relevant information, and constructs detailed error
// messages. Additionally, it handles timeouts gracefully by generating specific
// error messages for canceled requests.
func NewConnectErrorFromRedpandaAdminAPIError(err error) *connect.Error {
	var httpErr *adminapi.HTTPResponseError
	if errors.As(err, &httpErr) {
		connectCode := CodeFromHTTPStatus(httpErr.Response.StatusCode)

		adminApiErr, err := httpErr.DecodeGenericErrorBody()
		if err != nil {
			return NewConnectError(
				connectCode,
				errors.New(httpErr.Error()),
				NewErrorInfo(
					v1alpha1.Reason_REASON_REDPANDA_ADMIN_API_ERROR.String(), KeyVal{
						Key:   "adminapi_status_code",
						Value: strconv.Itoa(httpErr.Response.StatusCode),
					},
				),
			)
		}

		// Bubble up original Redpanda adminapi error message
		return NewConnectError(
			connectCode,
			errors.New(adminApiErr.Message),
			NewErrorInfo(
				v1alpha1.Reason_REASON_REDPANDA_ADMIN_API_ERROR.String(), KeyVal{
					Key:   "adminapi_status_code",
					Value: strconv.Itoa(httpErr.Response.StatusCode),
				},
			),
		)
	}

	// Write a proper error for requests that timed-out
	if errors.Is(err, context.Canceled) {
		return NewConnectError(
			connect.CodeCanceled,
			errors.New("the request to the Redpanda admin API timed out"),
			NewErrorInfo(v1alpha1.Reason_REASON_REDPANDA_ADMIN_API_ERROR.String()),
		)
	}

	return NewConnectError(
		connect.CodeInternal,
		err,
		NewErrorInfo(v1alpha1.Reason_REASON_REDPANDA_ADMIN_API_ERROR.String()),
	)
}

// CodeFromHTTPStatus converts an HTTP response status code into the
// corresponding connect.Code. If no status code matches, CodeUnknown will be
// returned.
func CodeFromHTTPStatus(status int) connect.Code {
	switch status {
	case http.StatusOK:
		return 0
	case 499:
		return connect.CodeCanceled
	case http.StatusInternalServerError:
		return connect.CodeInternal
	case http.StatusBadRequest:
		return connect.CodeInvalidArgument
	case http.StatusGatewayTimeout:
		return connect.CodeDeadlineExceeded
	case http.StatusNotFound:
		return connect.CodeNotFound
	case http.StatusConflict:
		return connect.CodeAlreadyExists
	case http.StatusForbidden:
		return connect.CodePermissionDenied
	case http.StatusUnauthorized:
		return connect.CodeUnauthenticated
	case http.StatusTooManyRequests:
		return connect.CodeResourceExhausted
	case http.StatusNotImplemented:
		return connect.CodeUnimplemented
	case http.StatusServiceUnavailable:
		return connect.CodeUnavailable
	default:
		return connect.CodeUnknown
	}
}
