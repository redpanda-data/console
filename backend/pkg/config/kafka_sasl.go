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

const (
	// SASLMechanismPlain represents the configuration value for SASL Plain authentication.
	SASLMechanismPlain = "PLAIN"
	// SASLMechanismScramSHA256 represents the configuration value for SASL scram-sha-256 authentication.
	SASLMechanismScramSHA256 = "SCRAM-SHA-256"
	// SASLMechanismScramSHA512 represents the configuration value for SASL scram-sha-512 authentication.
	SASLMechanismScramSHA512 = "SCRAM-SHA-512"
	// SASLMechanismGSSAPI represents the configuration value for SASL Kerberos authentication.
	SASLMechanismGSSAPI = "GSSAPI"
	// SASLMechanismOAuthBearer represents the configuration value for SASL OAuth authentication.
	SASLMechanismOAuthBearer = "OAUTHBEARER"
	// SASLMechanismAWSManagedStreamingIAM represents the configuration value for authenticating via AWS MSK IAM.
	SASLMechanismAWSManagedStreamingIAM = "AWS_MSK_IAM"
)

// KafkaSASL for Kafka client
type KafkaSASL struct {
	Enabled      bool                 `yaml:"enabled"`
	Username     string               `yaml:"username"`
	Password     string               `yaml:"password"`
	Mechanism    string               `yaml:"mechanism"`
	OAUth        KafkaSASLOAuthBearer `yaml:"oauth"`
	GSSAPIConfig KafkaSASLGSSAPI      `yaml:"gssapi"`
	AWSMskIam    KafkaSASLAwsMskIam   `yaml:"awsMskIam"`
}

// RegisterFlags for all sensitive Kafka SASL configs.
func (c *KafkaSASL) RegisterFlags(f *flag.FlagSet) {
	f.StringVar(&c.Password, "kafka.sasl.password", "", "SASL password")
	c.OAUth.RegisterFlags(f)
	c.GSSAPIConfig.RegisterFlags(f)
	c.AWSMskIam.RegisterFlags(f)
}

// SetDefaults for SASL Config
func (c *KafkaSASL) SetDefaults() {
	c.Mechanism = SASLMechanismPlain
	c.GSSAPIConfig.SetDefaults()
}

// Validate SASL config input
func (c *KafkaSASL) Validate() error {
	switch c.Mechanism {
	case SASLMechanismPlain, SASLMechanismScramSHA256, SASLMechanismScramSHA512:
		// Valid and supported
	case SASLMechanismGSSAPI:
		err := c.GSSAPIConfig.Validate()
		if err != nil {
			return fmt.Errorf("failed to validate gssapi config: %w", err)
		}
	case SASLMechanismOAuthBearer:
		err := c.OAUth.Validate()
		if err != nil {
			return fmt.Errorf("failed to validate OAuth Bearer config: %w", err)
		}
	case SASLMechanismAWSManagedStreamingIAM:
		err := c.AWSMskIam.Validate()
		if err != nil {
			return fmt.Errorf("failed to validate aws msk iam config: %w", err)
		}
	default:
		return fmt.Errorf("given sasl mechanism '%v' is invalid", c.Mechanism)
	}

	return nil
}
