package kafka

import (
	"flag"

	"github.com/cloudhut/common/flagext"
)

// Config required for opening a connection to Kafka
type Config struct {
	// General
	Brokers      flagext.StringsSlice
	ClientID     string
	KafkaVersion string

	// TLS
	TLSEnabled               bool
	TLSCaFilePath            string
	TLSCertFilePath          string
	TLSKeyFilePath           string
	TLSPassphrase            string
	TLSInsecureSkipTLSVerify bool

	// Authentication
	SASLEnabled      bool
	SASLUseHandshake bool
	SASLUsername     string
	SASLPassword     string
}

// RegisterFlags registers all nested config flags.
func (c *Config) RegisterFlags(f *flag.FlagSet) {
	f.Var(&c.Brokers, "kafka.brokers", "Kafka Broker addresses (comma separated)")
	f.StringVar(&c.KafkaVersion, "kafka.version", "1.0.0", "The kafka cluster's version (e. g. \"2.3.0\")")
	f.StringVar(&c.ClientID, "kafka.client-id", "kafka-owl", "ClientID to identify the consumer")

	// TLS
	f.BoolVar(&c.TLSEnabled, "kafka.tls.enabled", false, "Whether or not to use TLS")
	f.StringVar(&c.TLSCaFilePath, "kafka.tls.ca-file-path", "", "Filepath to TLS ca file")
	f.StringVar(&c.TLSCertFilePath, "kafka.tls.cert-file-path", "", "Filepath to TLS cert file")
	f.StringVar(&c.TLSKeyFilePath, "kafka.tls.key-file-path", "", "Filepath to TLS key file")
	f.StringVar(&c.TLSPassphrase, "kafka.tls.passphrase", "", "Passphrase to decrypt the TLS key (leave empty for unencrypted key files)")
	f.BoolVar(&c.TLSInsecureSkipTLSVerify, "kafka.tls.insecure-skip-verify", false, "If InsecureSkipVerify is true, TLS accepts any certificate presented by the server and any host name in that certificate.")

	// Authentication
	f.BoolVar(&c.SASLEnabled, "kafka.sasl.enabled", false, "Whether or not to use SASL authentication")
	f.BoolVar(&c.SASLUseHandshake, "kafka.sasl.use-handshake", true, "Whether or not to send a SASL handshake first")
	f.StringVar(&c.SASLUsername, "kafka.sasl.username", "", "SASL username")
	f.StringVar(&c.SASLPassword, "kafka.sasl.password", "", "SASL password")
}
