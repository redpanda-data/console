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

// HTTPBasicAuth defines the configuration for HTTP basic authentication.
type HTTPBasicAuth struct {
	Username string `yaml:"username"`
	Password string `yaml:"password"`
}

// RegisterFlagsWithPrefix for all sensitive HTTPBasicAuth configs.
func (c *HTTPBasicAuth) RegisterFlagsWithPrefix(f *flag.FlagSet, prefix string) {
	f.StringVar(&c.Password, prefix+"password", "", "HTTP basic auth password")
}
