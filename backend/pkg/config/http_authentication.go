// Copyright 2024 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package config

import "flag"

// HTTPAuthentication defines configuration properties for authenticating against
// any upstream HTTP API.
type HTTPAuthentication struct {
	// ImpersonateUser enables an enterprise feature where the
	// authentication credentials used by the user to log into
	// the Web UI are impersonated for connections to upstream
	// services like Kafka, Schema Registry, and Redpanda Admin API.
	// When enabled, the user's Web UI authentication method
	// (e.g., OIDC or Basic) determines the authentication mechanism
	// used for these services. The user’s identity must exist
	// in the upstream service and have appropriate permissions
	// for successful authentication. If this is enabled, other
	// login credentials cannot be set.
	ImpersonateUser bool `yaml:"impersonateUser"`

	// BasicAuth is optional HTTP basic auth settings for authenticating
	// with plain username and password.
	BasicAuth HTTPBasicAuth `yaml:"basic"`

	// BearerToken is a token that will be set as HTTP header for upstream
	// requests as follows: "Authorization: Bearer $token".
	BearerToken string `yaml:"bearerToken"`
}

// RegisterFlags registers flags for sensitive schema registry authentication inputs.
func (c *HTTPAuthentication) RegisterFlags(f *flag.FlagSet, prefix string) {
	c.BasicAuth.RegisterFlagsWithPrefix(f, prefix)
	f.StringVar(&c.BearerToken, prefix+"token", "", "Bearer token for authenticating against the API (optional)")
}
