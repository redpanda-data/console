package kafka

import (
	"flag"
	"fmt"
)

const (
	SASLMechanismPlain                  = "PLAIN"
	SASLMechanismScramSHA256            = "SCRAM-SHA-256"
	SASLMechanismScramSHA512            = "SCRAM-SHA-512"
	SASLMechanismGSSAPI                 = "GSSAPI"
	SASLMechanismOAuthBearer            = "OAUTHBEARER"
	SASLMechanismAWSManagedStreamingIAM = "AWS_MSK_IAM"
)

// SASLConfig for Kafka client
type SASLConfig struct {
	Enabled      bool             `yaml:"enabled"`
	Username     string           `yaml:"username"`
	Password     string           `yaml:"password"`
	Mechanism    string           `yaml:"mechanism"`
	OAUth        SASLOAuthBearer  `yaml:"oauth"`
	GSSAPIConfig SASLGSSAPIConfig `yaml:"gssapi"`
	AWSMskIam    SASLAwsMskIam    `yaml:"awsMskIam"`
}

// RegisterFlags for all sensitive Kafka SASL configs.
func (c *SASLConfig) RegisterFlags(f *flag.FlagSet) {
	f.StringVar(&c.Password, "kafka.sasl.password", "", "SASL password")
	c.OAUth.RegisterFlags(f)
	c.GSSAPIConfig.RegisterFlags(f)
	c.AWSMskIam.RegisterFlags(f)
}

// SetDefaults for SASL Config
func (c *SASLConfig) SetDefaults() {
	c.Mechanism = SASLMechanismPlain
	c.GSSAPIConfig.SetDefaults()
}

// Validate SASL config input
func (c *SASLConfig) Validate() error {
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
