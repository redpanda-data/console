package kafka

import (
	"crypto/tls"
	"crypto/x509"
	"encoding/pem"
	"fmt"
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
	"io/ioutil"
	"net"
	"os"
	"time"

	"github.com/Shopify/sarama"
)

// NewKgoConfig creates a new Config for the Kafka Client as exposed by the franz-go library.
// If TLS certificates can't be read an error will be returned.
func NewKgoConfig(cfg *Config, logger *zap.Logger, hooks kgo.Hook) ([]kgo.Opt, error) {
	opts := []kgo.Opt{
		kgo.SeedBrokers(cfg.Brokers...),
		kgo.MaxVersions(kversion.V2_6_0()),
		kgo.ClientID(cfg.ClientID),
	}

	// Create Logger
	kgoLogger := KgoZapLogger{
		logger: logger.With(zap.String("source", "kafka_client")).Sugar(),
	}
	opts = append(opts, kgo.WithLogger(kgoLogger))

	// Attach hooks
	opts = append(opts, kgo.WithHooks(hooks))

	// Configure SASL
	if cfg.SASL.Enabled {
		// SASL Plain
		if cfg.SASL.Mechanism == "PLAIN" {
			mechanism := plain.Auth{
				User: cfg.SASL.Username,
				Pass: cfg.SASL.Password,
			}.AsMechanism()
			opts = append(opts, kgo.SASL(mechanism))
		}

		// SASL SCRAM
		if cfg.SASL.Mechanism == "SCRAM-SHA-256" || cfg.SASL.Mechanism == "SCRAM-SHA-256" {
			var mechanism sasl.Mechanism
			scramAuth := scram.Auth{
				User: cfg.SASL.Username,
				Pass: cfg.SASL.Password,
			}
			if cfg.SASL.Mechanism == "SCRAM-SHA-256" {
				mechanism = scramAuth.AsSha256Mechanism()
			}
			if cfg.SASL.Mechanism == "SCRAM-SHA-512" {
				mechanism = scramAuth.AsSha512Mechanism()
			}
			opts = append(opts, kgo.SASL(mechanism))
		}

		// Kerberos
		if cfg.SASL.Mechanism == "GSSAPI" {
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
			caCertPool.AppendCertsFromPEM(ca)
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

// NewSaramaConfig creates a new sarama config which can be used for the admin client
func NewSaramaConfig(cfg *Config) (*sarama.Config, error) {
	sConfig := sarama.NewConfig()

	// Configure general Kafka settings
	version, err := sarama.ParseKafkaVersion(cfg.ClusterVersion)
	if err != nil {
		return nil, err
	}
	sConfig.ClientID = cfg.ClientID
	sConfig.Version = version
	sConfig.Net.KeepAlive = 15 * time.Second
	sConfig.Net.DialTimeout = 15 * time.Second
	sConfig.Net.ReadTimeout = 15 * time.Second
	sConfig.Net.WriteTimeout = 15 * time.Second

	// Configure TLS
	if cfg.TLS.Enabled {
		sConfig.Net.TLS.Enable = true
		sConfig.Net.TLS.Config = &tls.Config{InsecureSkipVerify: cfg.TLS.InsecureSkipTLSVerify}

		// Load CA file. If we don't load a CA file the System Cert pool will be used by default.
		if cfg.TLS.CaFilepath != "" {
			ca, err := ioutil.ReadFile(cfg.TLS.CaFilepath)
			if err != nil {
				return nil, err
			}
			caCertPool := x509.NewCertPool()
			caCertPool.AppendCertsFromPEM(ca)
			sConfig.Net.TLS.Config.RootCAs = caCertPool
		}

		// Load TLS / Key files
		if cfg.TLS.CertFilepath != "" && cfg.TLS.KeyFilepath != "" {
			err := canReadCertAndKey(cfg.TLS.CertFilepath, cfg.TLS.KeyFilepath)
			if err != nil {
				return nil, err
			}

			// Load Cert files and if necessary decrypt it too
			certs, err := parseCerts(cfg.TLS.CertFilepath, cfg.TLS.KeyFilepath, cfg.TLS.Passphrase)
			if err != nil {
				return nil, err
			}
			sConfig.Net.TLS.Config.Certificates = certs
		}
	}

	// Configure SASL
	if cfg.SASL.Enabled {
		sConfig.Net.SASL.Enable = true
		sConfig.Net.SASL.Handshake = cfg.SASL.UseHandshake
		sConfig.Net.SASL.User = cfg.SASL.Username
		sConfig.Net.SASL.Password = cfg.SASL.Password

		switch cfg.SASL.Mechanism {
		case sarama.SASLTypeSCRAMSHA256:
			sConfig.Net.SASL.Mechanism = sarama.SASLTypeSCRAMSHA256
			sConfig.Net.SASL.SCRAMClientGeneratorFunc = func() sarama.SCRAMClient { return &xdgSCRAMClient{HashGeneratorFcn: scramSha256} }
		case sarama.SASLTypeSCRAMSHA512:
			sConfig.Net.SASL.Mechanism = sarama.SASLTypeSCRAMSHA512
			sConfig.Net.SASL.SCRAMClientGeneratorFunc = func() sarama.SCRAMClient { return &xdgSCRAMClient{HashGeneratorFcn: scramSha512} }
		case sarama.SASLTypeGSSAPI:
			sConfig.Net.SASL.Mechanism = sarama.SASLTypeGSSAPI
			switch cfg.SASL.GSSAPIConfig.AuthType {
			case "USER_AUTH:":
				sConfig.Net.SASL.GSSAPI.AuthType = sarama.KRB5_USER_AUTH
			case "KEYTAB_AUTH":
				sConfig.Net.SASL.GSSAPI.AuthType = sarama.KRB5_KEYTAB_AUTH
				sConfig.Net.SASL.GSSAPI.KeyTabPath = cfg.SASL.GSSAPIConfig.KeyTabPath
			}
			sConfig.Net.SASL.GSSAPI.Username = cfg.SASL.Username
			sConfig.Net.SASL.GSSAPI.Password = cfg.SASL.GSSAPIConfig.Password
			sConfig.Net.SASL.GSSAPI.KerberosConfigPath = cfg.SASL.GSSAPIConfig.KerberosConfigPath
			sConfig.Net.SASL.GSSAPI.ServiceName = cfg.SASL.GSSAPIConfig.ServiceName
			sConfig.Net.SASL.GSSAPI.Realm = cfg.SASL.GSSAPIConfig.Realm
		}
	}

	err = sConfig.Validate()
	if err != nil {
		return nil, err
	}

	return sConfig, nil
}

// canReadCertAndKey returns true if the certificate and key files already exists otherwise returns false
func canReadCertAndKey(certPath, keyPath string) error {
	certReadable := canReadFile(certPath)
	keyReadable := canReadFile(keyPath)

	if certReadable == false && keyReadable == false {
		return fmt.Errorf("error reading key and certificate")
	}

	if certReadable == false {
		return fmt.Errorf("error reading %s, certificate and key must be supplied as a pair", certPath)
	}

	if keyReadable == false {
		return fmt.Errorf("error reading %s, certificate and key must be supplied as a pair", keyPath)
	}

	return nil
}

// canReadFile returns true if the file at the given part exists and is readable
func canReadFile(path string) bool {
	f, err := os.Open(path)
	if err != nil {
		return false
	}

	defer f.Close()

	return true
}

// parseCert parses a TLS certificate from the CertFile and KeyFile.
// If the key is encrypted, the passphrase will be used to decrypt it.
func parseCerts(certFilePath string, keyFilePath string, passphrase string) ([]tls.Certificate, error) {
	if certFilePath == "" && keyFilePath == "" {
		return nil, fmt.Errorf("No file path specified for TLS key and certificate in environment variables")
	}

	errMessage := "Could not load X509 key pair. "

	cert, err := ioutil.ReadFile(certFilePath)
	if err != nil {
		return nil, fmt.Errorf(errMessage, err)
	}

	prKeyBytes, err := ioutil.ReadFile(keyFilePath)
	if err != nil {
		return nil, fmt.Errorf(errMessage, err)
	}

	prKeyBytes, err = decodePrivateKey(prKeyBytes, passphrase)
	if err != nil {
		return nil, fmt.Errorf(errMessage, err)
	}

	tlsCert, err := tls.X509KeyPair(cert, prKeyBytes)
	if err != nil {
		return nil, fmt.Errorf(errMessage, err)
	}

	return []tls.Certificate{tlsCert}, nil
}

// getPrivateKey returns the private key in 'keyBytes', in a PEM-encoded format.
// If the private key is encrypted, 'passphrase' is used to decrypted the private key.
func decodePrivateKey(keyBytes []byte, passphrase string) ([]byte, error) {
	// this section makes some small changes to code from notary/tuf/utils/x509.go
	pemBlock, _ := pem.Decode(keyBytes)
	if pemBlock == nil {
		return nil, fmt.Errorf("no valid private key found")
	}

	var err error
	if x509.IsEncryptedPEMBlock(pemBlock) {
		keyBytes, err = x509.DecryptPEMBlock(pemBlock, []byte(passphrase))
		if err != nil {
			return nil, fmt.Errorf("private key is encrypted, but could not decrypt it: '%s'", err)
		}
		keyBytes = pem.EncodeToMemory(&pem.Block{Type: pemBlock.Type, Bytes: keyBytes})
	}

	return keyBytes, nil
}
