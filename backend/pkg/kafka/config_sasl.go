package kafka

import (
	"flag"
	"fmt"
)

const (
	SASLMechanismPlain       = "PLAIN"
	SASLMechanismScramSHA256 = "SCRAM-SHA-256"
	SASLMechanismScramSHA512 = "SCRAM-SHA-512"
	SASLMechanismGSSAPI      = "GSSAPI"
	SASLMechanismOAuthBearer = "OAUTHBEARER"
)

// SASLConfig for Kafka client
type SASLConfig struct {
	Enabled      bool             `koanf:"enabled"`
	Username     string           `koanf:"username"`
	Password     string           `koanf:"password"`
	Mechanism    string           `koanf:"mechanism"`
	GSSAPIConfig SASLGSSAPIConfig `koanf:"gssapi"`
}

// RegisterFlags for all sensitive Kafka SASL configs.
func (c *SASLConfig) RegisterFlags(f *flag.FlagSet) {
	f.StringVar(&c.Password, "kafka.sasl.password", "", "SASL password")
	c.GSSAPIConfig.RegisterFlags(f)
}

// SetDefaults for SASL Config
func (c *SASLConfig) SetDefaults() {
	c.Mechanism = SASLMechanismPlain
}

// Validate SASL config input
func (c *SASLConfig) Validate() error {
	switch c.Mechanism {
	case SASLMechanismPlain, SASLMechanismScramSHA256, SASLMechanismScramSHA512, SASLMechanismGSSAPI:
		// Valid and supported
	case SASLMechanismOAuthBearer:
		return fmt.Errorf("sasl mechanism '%v' is valid but not yet supported. Please submit an issue if you need it", c.Mechanism)
	default:
		return fmt.Errorf("given sasl mechanism '%v' is invalid", c.Mechanism)
	}

	return nil
}
