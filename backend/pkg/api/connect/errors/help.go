// Copyright 2023 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package errors

import "google.golang.org/genproto/googleapis/rpc/errdetails"

// NewHelp constructs a new errdetails.Help with one or more provided errdetails.Help_Link.
func NewHelp(links ...*errdetails.Help_Link) *errdetails.Help {
	return &errdetails.Help{Links: links}
}

// NewHelpLinkConsoleReferenceConfig returns a Help link to the Redpanda Console reference configuration.
func NewHelpLinkConsoleReferenceConfig() *errdetails.Help_Link {
	return &errdetails.Help_Link{
		Description: "Redpanda Console Configuration Reference",
		Url:         "https://docs.redpanda.com/current/reference/console/config/",
	}
}
