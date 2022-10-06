// Copyright 2022 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package config

import (
	"flag"
	"fmt"
)

// KafkaSASLOAuthBearer is the config struct for the SASL OAuthBearer mechanism
type KafkaSASLOAuthBearer struct {
	Token string `yaml:"token"`
}

// RegisterFlags registers all sensitive Kerberos settings as flag
func (c *KafkaSASLOAuthBearer) RegisterFlags(f *flag.FlagSet) {
	f.StringVar(&c.Token, "kafka.sasl.oauth.token", "", "OAuth Bearer Token")
}

func (c *KafkaSASLOAuthBearer) Validate() error {
	if c.Token == "" {
		return fmt.Errorf("OAuth Bearer token must be set")
	}

	return nil
}
