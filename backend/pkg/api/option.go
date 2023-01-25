// Copyright 2022 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package api

import (
	"io/fs"

	"github.com/redpanda-data/console/backend/pkg/redpanda"
)

// Option for creating an instance of API.
type Option func(*API)

// WithFrontendResources is an option to set an in-memory filesystem that provides the frontend resources.
// The index.html is expected to be at the root of the filesystem. This method is called by Console
// Enterprise, so that it can inject additional assets to the frontend.
func WithFrontendResources(fsys fs.FS) Option {
	return func(api *API) {
		api.FrontendResources = fsys
	}
}

// WithLicense provides the license information which was used to start Redpanda Console.
// It is used only for visibility & logging purposes and not for any license enforcing
// actions.
func WithLicense(license redpanda.License) Option {
	return func(api *API) {
		api.License = license
	}
}
