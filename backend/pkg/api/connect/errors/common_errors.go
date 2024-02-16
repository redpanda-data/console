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
	"errors"

	"connectrpc.com/connect"

	v1alpha1 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1alpha1"
)

// NewRedpandaAdminAPINotConfiguredError is a standard error to return if an endpoint
// requires the Redpanda Admin API to be configured, but it isn't.
func NewRedpandaAdminAPINotConfiguredError() *connect.Error {
	return NewConnectError(
		connect.CodeUnimplemented,
		errors.New("the redpanda admin api must be configured to use this endpoint"),
		NewErrorInfo(v1alpha1.Reason_REASON_FEATURE_NOT_CONFIGURED.String()),
		NewHelp(NewHelpLinkConsoleReferenceConfig()),
	)
}
