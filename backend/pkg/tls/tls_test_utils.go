// Copyright 2025 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package tls

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"log/slog"
	"math/big"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

// tlsTestSetup holds common test artifacts for TLS tests
type tlsTestSetup struct {
	Logger     *slog.Logger
	TmpDir     string
	CAPath     string
	CACert     *x509.Certificate
	CAPrivKey  *rsa.PrivateKey
	ServerCert *x509.Certificate
	CertPath   string
	KeyPath    string
}

// setupTLSTest prepares the test environment and certificates
func setupTLSTest(t *testing.T) *tlsTestSetup {
	logger := slog.New(slog.NewTextHandler(nil, &slog.HandlerOptions{Level: slog.LevelError + 1}))

	// Create temporary directory for test certificates
	tmpDir := t.TempDir()
	// Generate a test CA certificate
	caCert, caPrivKey := generateTestCACert(t)

	// Path for test CA file
	caPath := filepath.Join(tmpDir, "ca.crt")
	writeCertToPEMFile(t, caPath, caCert)

	// Generate a server certificate signed by our test CA
	serverCert, serverKey := generateServerCert(t, "localhost", caCert, caPrivKey)

	// Write server cert and key to files
	certPath := filepath.Join(tmpDir, "cert.pem")
	keyPath := filepath.Join(tmpDir, "key.pem")
	writeCertToPEMFile(t, certPath, serverCert)
	writeKeyToPEMFile(t, keyPath, serverKey)

	return &tlsTestSetup{
		Logger:     logger,
		TmpDir:     tmpDir,
		CAPath:     caPath,
		CACert:     caCert,
		CAPrivKey:  caPrivKey,
		ServerCert: serverCert,
		CertPath:   certPath,
		KeyPath:    keyPath,
	}
}

// generateTestCACert creates a CA certificate for testing
func generateTestCACert(t *testing.T) (*x509.Certificate, *rsa.PrivateKey) {
	template := &x509.Certificate{
		SerialNumber: big.NewInt(1),
		Subject: pkix.Name{
			Organization: []string{"Test CA"},
		},
		NotBefore:             time.Now(),
		NotAfter:              time.Now().Add(1 * time.Hour),
		KeyUsage:              x509.KeyUsageCertSign | x509.KeyUsageCRLSign,
		BasicConstraintsValid: true,
		IsCA:                  true,
		MaxPathLen:            1,
	}

	priv, err := rsa.GenerateKey(rand.Reader, 2048)
	require.NoError(t, err, "Failed to generate private key")

	derBytes, err := x509.CreateCertificate(rand.Reader, template, template, &priv.PublicKey, priv)
	require.NoError(t, err, "Failed to create certificate")

	cert, err := x509.ParseCertificate(derBytes)
	require.NoError(t, err, "Failed to parse certificate")

	return cert, priv
}

// generateServerCert creates a server certificate for testing
func generateServerCert(t *testing.T, hostname string, caCert *x509.Certificate, caKey *rsa.PrivateKey) (*x509.Certificate, *rsa.PrivateKey) {
	template := &x509.Certificate{
		SerialNumber: big.NewInt(2),
		Subject: pkix.Name{
			Organization: []string{"Test Server"},
		},
		DNSNames:    []string{hostname},
		NotBefore:   time.Now(),
		NotAfter:    time.Now().Add(1 * time.Hour),
		KeyUsage:    x509.KeyUsageDigitalSignature | x509.KeyUsageKeyEncipherment,
		ExtKeyUsage: []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
	}

	priv, err := rsa.GenerateKey(rand.Reader, 2048)
	require.NoError(t, err, "Failed to generate private key")

	derBytes, err := x509.CreateCertificate(rand.Reader, template, caCert, &priv.PublicKey, caKey)
	require.NoError(t, err, "Failed to create certificate")

	cert, err := x509.ParseCertificate(derBytes)
	require.NoError(t, err, "Failed to parse certificate")

	return cert, priv
}

// writeCertToPEMFile writes a certificate to a file in PEM format
func writeCertToPEMFile(t *testing.T, path string, cert *x509.Certificate) {
	certPEM := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: cert.Raw})
	err := os.WriteFile(path, certPEM, 0o600)
	require.NoError(t, err, "Failed to write certificate to PEM file")
}

// writeKeyToPEMFile writes a key to a file in PEM format
func writeKeyToPEMFile(t *testing.T, path string, key *rsa.PrivateKey) {
	keyDER := x509.MarshalPKCS1PrivateKey(key)
	keyPEM := pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: keyDER})
	err := os.WriteFile(path, keyPEM, 0o600)
	require.NoError(t, err, "Failed to write key to PEM file")
}

// verifyConnectionState verifies that the given TLS connection state passes verification
func verifyConnectionState(t *testing.T, cfg *tls.Config, cert *x509.Certificate) {
	state := tls.ConnectionState{
		PeerCertificates: []*x509.Certificate{cert},
	}
	require.NoError(t, cfg.VerifyConnection(state),
		"Expected verification to succeed with certificate")
}
