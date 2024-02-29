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
	"time"
)

// KafkaSASLAwsMskIam is the config for AWS IAM SASL mechanism,
// see: https://docs.aws.amazon.com/msk/latest/developerguide/iam-access-control.html
type KafkaSASLAwsMskIam struct {
	AccessKey string `yaml:"accessKey"`
	SecretKey string `yaml:"secretKey"`

	// SessionToken, if non-empty, is a session / security token to use for authentication.
	// See: https://docs.aws.amazon.com/STS/latest/APIReference/welcome.html
	SessionToken string `yaml:"sessionToken"`

	// UserAgent is the user agent to for the client to use when connecting
	// to Kafka, overriding the default "franz-go/<runtime.Version()>/<hostname>".
	//
	// Setting a UserAgent allows authorizing based on the aws:UserAgent
	// condition key; see the following link for more details:
	// https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_condition-keys.html#condition-keys-useragent
	UserAgent string `yaml:"userAgent"`

	// Region to send the API requests to, such as us-west-2 or us-east-2
	// https://aws.github.io/aws-sdk-go-v2/docs/configuring-sdk/#specifying-the-aws-region
	Region string `yaml:"region"`

	// ClientTimeOutDuration, in seconds, is duration specified for the service API client
	// to construct an aws.Config using the AWS shared configuration sources
	// https://aws.github.io/aws-sdk-go-v2/docs/configuring-sdk/#loading-aws-shared-configuration
	ClientTimeOutDuration time.Duration `yaml:"clientTimeout"`
}

// RegisterFlags registers all sensitive Kerberos settings as flag
func (c *KafkaSASLAwsMskIam) RegisterFlags(f *flag.FlagSet) {
	f.StringVar(&c.SecretKey, "kafka.sasl.aws-msk-iam.secret-key", "", "IAM Account secret key")
	f.StringVar(&c.SessionToken, "kafka.sasl.aws-msk-iam.session-token", "", "Optional session token for authentication purposes. Uses the AWS Security Token Service API")
	f.DurationVar(&c.ClientTimeOutDuration, "kafka.sasl.aws-msk-iam.client-timeout", 10*time.Second, "API client timeout duration to get AWS shared configuration and credentials")
}

// Validate the given SASL AWS MSK IAM configuration options.
func (c *KafkaSASLAwsMskIam) Validate() error {
	if (c.AccessKey == "" && c.SecretKey != "") || (c.AccessKey != "" && c.SecretKey == "") {
		return fmt.Errorf("invalid AWS IAM configuration. Both access and secret keys are required")
	}

	// if both or neither are set, it's valid
	return nil
}
