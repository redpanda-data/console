package kafka

import (
	"crypto/tls"
	"crypto/x509"
	"encoding/pem"
	"fmt"
	"io/ioutil"
	"net"
	"time"

	"github.com/jcmturner/gokrb5/v8/client"
	krbconfig "github.com/jcmturner/gokrb5/v8/config"
	"github.com/jcmturner/gokrb5/v8/keytab"
	"github.com/twmb/franz-go/pkg/kgo"
	"github.com/twmb/franz-go/pkg/kversion"
	"github.com/twmb/franz-go/pkg/sasl"
	"github.com/twmb/franz-go/pkg/sasl/kerberos"
	"github.com/twmb/franz-go/pkg/sasl/plain"
	"github.com/twmb/franz-go/pkg/sasl/scram"
	"go.uber.org/zap"
)

// NewKgoConfig creates a new Config for the Kafka Client as exposed by the franz-go library.
// If TLS certificates can't be read an error will be returned.
func NewKgoConfig(cfg *Config, logger *zap.Logger, hooks kgo.Hook) ([]kgo.Opt, error) {
	opts := []kgo.Opt{
		kgo.SeedBrokers(cfg.Brokers...),
		kgo.MaxVersions(kversion.V2_6_0()),
		kgo.ClientID(cfg.ClientID),
		kgo.FetchMaxBytes(5 * 1000 * 1000), // 5MB
		kgo.AllowedConcurrentFetches(12),
		// We keep control records because we need to consume them in order to know whether the last message in a
		// a partition is worth waiting for or not (because it's a control record which we would never receive otherwise)
		kgo.KeepControlRecords(),
	}

	// Create Logger
	kgoLogger := KgoZapLogger{
		logger: logger.With(zap.String("source", "kafka_client")).Sugar(),
	}
	opts = append(opts, kgo.WithLogger(kgoLogger))

	// Attach hooks
	opts = append(opts, kgo.WithHooks(hooks))

	// Add Rack Awareness if configured
	if cfg.RackID != "" {
		opts = append(opts, kgo.Rack(cfg.RackID))
	}

	// Configure SASL
	if cfg.SASL.Enabled {
		// SASL Plain
		if cfg.SASL.Mechanism == SASLMechanismPlain {
			mechanism := plain.Auth{
				User: cfg.SASL.Username,
				Pass: cfg.SASL.Password,
			}.AsMechanism()
			opts = append(opts, kgo.SASL(mechanism))
		}

		// SASL SCRAM
		if cfg.SASL.Mechanism == SASLMechanismScramSHA256 || cfg.SASL.Mechanism == SASLMechanismScramSHA512 {
			var mechanism sasl.Mechanism
			scramAuth := scram.Auth{
				User: cfg.SASL.Username,
				Pass: cfg.SASL.Password,
			}
			if cfg.SASL.Mechanism == SASLMechanismScramSHA256 {
				logger.Debug("configuring SCRAM-SHA-256 mechanism")
				mechanism = scramAuth.AsSha256Mechanism()
			}
			if cfg.SASL.Mechanism == SASLMechanismScramSHA512 {
				logger.Debug("configuring SCRAM-SHA-512 mechanism")
				mechanism = scramAuth.AsSha512Mechanism()
			}
			opts = append(opts, kgo.SASL(mechanism))
		}

		// Kerberos
		if cfg.SASL.Mechanism == SASLMechanismGSSAPI {
			logger.Debug("configuring GSSAPI mechanism")
			kerbCfg, err := krbconfig.Load(cfg.SASL.GSSAPIConfig.KerberosConfigPath)
			if err != nil {
				return nil, fmt.Errorf("failed to create kerberos config from specified config filepath: %w", err)
			}
			var krbClient *client.Client
			switch cfg.SASL.GSSAPIConfig.AuthType {
			case "USER_AUTH:":
				krbClient = client.NewWithPassword(
					cfg.SASL.GSSAPIConfig.Username,
					cfg.SASL.GSSAPIConfig.Realm,
					cfg.SASL.GSSAPIConfig.Password,
					kerbCfg)
			case "KEYTAB_AUTH":
				ktb, err := keytab.Load(cfg.SASL.GSSAPIConfig.KeyTabPath)
				if err != nil {
					return nil, fmt.Errorf("failed to load keytab: %w", err)
				}
				krbClient = client.NewWithKeytab(
					cfg.SASL.GSSAPIConfig.Username,
					cfg.SASL.GSSAPIConfig.Realm,
					ktb,
					kerbCfg)
			}
			kerberosMechanism := kerberos.Auth{
				Client:           krbClient,
				Service:          cfg.SASL.GSSAPIConfig.ServiceName,
				PersistAfterAuth: true,
			}.AsMechanism()
			opts = append(opts, kgo.SASL(kerberosMechanism))
		}
	}

	// Configure TLS
	var caCertPool *x509.CertPool
	if cfg.TLS.Enabled {
		// Root CA
		if cfg.TLS.CaFilepath != "" {
			ca, err := ioutil.ReadFile(cfg.TLS.CaFilepath)
			if err != nil {
				return nil, err
			}
			caCertPool = x509.NewCertPool()
			isSuccessful := caCertPool.AppendCertsFromPEM(ca)
			if !isSuccessful {
				logger.Warn("failed to append ca file to cert pool, is this a valid PEM format?")
			}
		}

		// If configured load TLS cert & key - Mutual TLS
		var certificates []tls.Certificate
		if cfg.TLS.CertFilepath != "" && cfg.TLS.KeyFilepath != "" {
			// 1. Read certificates
			cert, err := ioutil.ReadFile(cfg.TLS.CertFilepath)
			if err != nil {
				return nil, fmt.Errorf("failed to TLS certificate: %w", err)
			}

			privateKey, err := ioutil.ReadFile(cfg.TLS.KeyFilepath)
			if err != nil {
				return nil, fmt.Errorf("failed to read TLS key: %w", err)
			}

			// 2. Check if private key needs to be decrypted. Decrypt it if passphrase is given, otherwise return error
			pemBlock, _ := pem.Decode(privateKey)
			if pemBlock == nil {
				return nil, fmt.Errorf("no valid private key found")
			}

			if x509.IsEncryptedPEMBlock(pemBlock) {
				decryptedKey, err := x509.DecryptPEMBlock(pemBlock, []byte(cfg.TLS.Passphrase))
				if err != nil {
					return nil, fmt.Errorf("private key is encrypted, but could not decrypt it: %s", err)
				}
				// If private key was encrypted we can overwrite the original contents now with the decrypted version
				privateKey = pem.EncodeToMemory(&pem.Block{Type: pemBlock.Type, Bytes: decryptedKey})
			}
			tlsCert, err := tls.X509KeyPair(cert, privateKey)
			if err != nil {
				return nil, fmt.Errorf("cannot parse pem: %s", err)
			}
			certificates = []tls.Certificate{tlsCert}
		}

		tlsDialer := &tls.Dialer{
			NetDialer: &net.Dialer{Timeout: 10 * time.Second},
			Config: &tls.Config{
				InsecureSkipVerify: cfg.TLS.InsecureSkipTLSVerify,
				Certificates:       certificates,
				RootCAs:            caCertPool,
			},
		}
		opts = append(opts, kgo.Dialer(tlsDialer.DialContext))
	}

	return opts, nil
}
