// Copyright 2023 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package config

import (
	"time"

	"github.com/cloudhut/common/rest"
)

// Server contains HTTP server specific configurations. Most configs relate to the net/http server
// config, however this struct will also carry further configurations that relate to the HTTP
// transport, such as the allowed origins.
type Server struct {
	//nolint:revive // Koanf parses these struct tags and is aware of the squash tag
	rest.Config `yaml:",squash"`

	// AllowedOrigins is a list of origins that can send requests from a browser to the Console
	// API. By default, a same-site policy is enforced. This setting is required to prevent
	// CSRF-attacks.
	AllowedOrigins []string `yaml:"allowedOrigins"`
}

// SetDefaults for server config.
func (s *Server) SetDefaults() {
	s.Config.SetDefaults()
	// We use a timeout of up to 31 minutes in the ListMessages handler for certain requests.
	// In the future we may be able to use http.NewResponseController to overwrite the global
	// write timeout only for those routes that require to be run longer, but as of writing this
	// it is not possible to set this from inside the connect handlers.
	// References:
	// 1. https://github.com/connectrpc/connect-go/issues/604
	// 2. https://github.com/connectrpc/connect-go/issues/356
	s.HTTPServerWriteTimeout = 32 * time.Minute
	s.AllowedOrigins = nil
}
