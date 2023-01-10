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

// KafkaSASLGSSAPI represents the Kafka Kerberos config.
type KafkaSASLGSSAPI struct {
	AuthType           string `yaml:"authType"`
	KeyTabPath         string `yaml:"keyTabPath"`
	KerberosConfigPath string `yaml:"kerberosConfigPath"`
	ServiceName        string `yaml:"serviceName"`
	Username           string `yaml:"username"`
	Password           string `yaml:"password"`
	Realm              string `yaml:"realm"`

	// EnableFAST enables FAST, which is a pre-authentication framework for Kerberos.
	// It includes a mechanism for tunneling pre-authentication exchanges using armoured KDC messages.
	// FAST provides increased resistance to passive password guessing attacks.
	EnableFast bool `yaml:"enableFast"`
}

// RegisterFlags registers all sensitive Kerberos settings as flag
func (k *KafkaSASLGSSAPI) RegisterFlags(f *flag.FlagSet) {
	f.StringVar(&k.Password, "kafka.sasl.gssapi.password", "", "Kerberos password if auth type user auth is used")
}

// Validate user input for Kerberos configuration.
func (k *KafkaSASLGSSAPI) Validate() error {
	if k.AuthType != "USER_AUTH" && k.AuthType != "KEYTAB_AUTH" {
		return fmt.Errorf("auth type '%v' is invalid", k.AuthType)
	}

	return nil
}

// SetDefaults for the Kafka Kerberos configurations.
func (k *KafkaSASLGSSAPI) SetDefaults() {
	k.EnableFast = true
}
