// Copyright 2022 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package kafka

import (
	"flag"
)

// SASLAwsMskIam is the config for AWS IAM SASL mechanism, see: https://docs.aws.amazon.com/msk/latest/developerguide/iam-access-control.html
type SASLAwsMskIam struct {
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
}

// RegisterFlags registers all sensitive Kerberos settings as flag
func (c *SASLAwsMskIam) RegisterFlags(f *flag.FlagSet) {
	f.StringVar(&c.AccessKey, "kafka.sasl.aws-msk-iam.secret-key", "", "IAM Account secret key")
	f.StringVar(&c.SessionToken, "kafka.sasl.aws-msk-iam.session-token", "", "Optional session token for authentication purposes. Uses the AWS Security Token Service API")
}

func (c *SASLAwsMskIam) Validate() error {
	return nil
}
