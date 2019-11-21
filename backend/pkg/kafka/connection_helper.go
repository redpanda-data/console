package kafka

import (
	"crypto/tls"
	"crypto/x509"
	"encoding/pem"
	"fmt"
	"io/ioutil"
	"os"
	"time"

	"github.com/Shopify/sarama"
)

// NewSaramaConfig creates a new sarama config which can be used for the admin client
func NewSaramaConfig(cfg *Config) (*sarama.Config, error) {
	sConfig := sarama.NewConfig()

	// Configure general Kafka settings
	version, err := sarama.ParseKafkaVersion(cfg.KafkaVersion)
	if err != nil {
		return nil, err
	}
	sConfig.ClientID = cfg.ClientID
	sConfig.Version = version
	sConfig.Net.KeepAlive = 30 * time.Second

	// Configure SASL
	if cfg.SASLEnabled {
		sConfig.Net.SASL.Enable = true
		sConfig.Net.SASL.Handshake = cfg.SASLUseHandshake
		sConfig.Net.SASL.User = cfg.SASLUsername
		sConfig.Net.SASL.Password = cfg.SASLPassword
	}

	// Configure TLS
	if cfg.TLSEnabled {
		sConfig.Net.TLS.Enable = true

		if cfg.TLSCaFilePath == "" {
			sConfig.Net.TLS.Config = &tls.Config{}
		}

		sConfig.Net.TLS.Config = &tls.Config{
			RootCAs:            x509.NewCertPool(),
			InsecureSkipVerify: cfg.TLSInsecureSkipTLSVerify,
		}

		// Load CA file
		if cfg.TLSCaFilePath != "" {
			ca, err := ioutil.ReadFile(cfg.TLSCaFilePath)
			if err != nil {
				return nil, err
			}
			sConfig.Net.TLS.Config.RootCAs.AppendCertsFromPEM(ca)
		}

		// Load TLS / Key files
		if cfg.TLSCertFilePath != "" || cfg.TLSKeyFilePath != "" {
			err := canReadCertAndKey(cfg.TLSCertFilePath, cfg.TLSKeyFilePath)
			if err != nil {
				return nil, err
			}

			// Load Cert files and if necessary it decrypt it too
			cert, err := parseCerts(cfg.TLSCertFilePath, cfg.TLSKeyFilePath, cfg.TLSPassphrase)
			if err != nil {
				return nil, err
			}
			sConfig.Net.TLS.Config.Certificates = cert
		}
	}

	err = sConfig.Validate()
	if err != nil {
		return nil, err
	}

	return sConfig, nil
}

// canReadCertAndKey returns true if the certificate and key files already existsotherwise returns false
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
