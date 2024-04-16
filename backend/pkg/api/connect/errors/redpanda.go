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

	"connectrpc.com/connect"
	adminapi "github.com/redpanda-data/common-go/rpadmin"

	v1alpha1 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1alpha1"
)

// NewConnectErrorFromRedpandaAdminAPIError enhances error handling by providing
// more insightful connect.Error messages to users. It unwraps errors from the
// Redpanda Admin API, allowing for better feedback. It decodes HTTP response
// errors, extracts relevant information, and constructs detailed error
// messages. Additionally, it handles timeouts gracefully by generating specific
// error messages for canceled requests.
func NewConnectErrorFromRedpandaAdminAPIError(err error, prefixErrMsg string) *connect.Error {
	var httpErr *adminapi.HTTPResponseError
	if errors.As(err, &httpErr) {
		connectCode := CodeFromHTTPStatus(httpErr.Response.StatusCode)

		adminAPIErr, err := httpErr.DecodeGenericErrorBody()
		if err != nil {
			return NewConnectError(
				connectCode,
				errors.New(prefixErrMsg+httpErr.Error()),
				NewErrorInfo(
					v1alpha1.Reason_REASON_REDPANDA_ADMIN_API_ERROR.String(), KeyVal{
						Key:   "adminapi_status_code",
						Value: strconv.Itoa(httpErr.Response.StatusCode),
					},
				),
			)
		}

		// If message is exactly "Not found" we can assume it's a non-existent route in
		// Console For resources that do not exist we receive a different error message,
		// hence we default to CodeNotFound for 404 response codes.
		if adminAPIErr.Message == "Not found" {
			connectCode = connect.CodeUnimplemented
		}

		// Bubble up original Redpanda adminapi error message
		return NewConnectError(
			connectCode,
			errors.New(prefixErrMsg+adminAPIErr.Message),
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
			errors.New(prefixErrMsg+"the request to the Redpanda admin API timed out"),
			NewErrorInfo(v1alpha1.Reason_REASON_REDPANDA_ADMIN_API_ERROR.String()),
		)
	}

	return NewConnectError(
		connect.CodeInternal,
		fmt.Errorf("%v%w", prefixErrMsg, err),
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
		return connect.CodeUnavailable
	case http.StatusNotFound:
		return connect.CodeNotFound
	case http.StatusConflict:
		return connect.CodeAborted
	case http.StatusForbidden:
		return connect.CodePermissionDenied
	case http.StatusUnauthorized:
		return connect.CodeUnauthenticated
	case http.StatusTooManyRequests:
		return connect.CodeUnavailable
	case http.StatusNotImplemented:
		return connect.CodeUnimplemented
	case http.StatusServiceUnavailable:
		return connect.CodeUnavailable
	default:
		return connect.CodeUnknown
	}
}
