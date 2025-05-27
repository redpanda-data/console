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
	"context"
	"crypto/tls"
	"crypto/x509"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestMaybeWithDynamicClientCA(t *testing.T) {
	// Setup test environment
	testSetup := setupTLSTest(t)
	defer os.RemoveAll(testSetup.TmpDir)

	t.Run("empty CA path returns nil", func(t *testing.T) {
		ctx := context.Background()
		cfg := &tls.Config{}

		configFunc := MaybeWithDynamicClientCA(ctx, "", "localhost", 5*time.Minute, testSetup.Logger)
		err := configFunc(cfg)
		assert.NoError(t, err, "Expected no error with empty CA path")
	})

	t.Run("valid CA path configures TLS", func(t *testing.T) {
		ctx := context.Background()
		cfg := &tls.Config{}

		configFunc := MaybeWithDynamicClientCA(ctx, testSetup.CAPath, "localhost", 5*time.Minute, testSetup.Logger)
		err := configFunc(cfg)
		require.NoError(t, err, "Expected no error with valid CA path")

		// Check that InsecureSkipVerify is true
		assert.True(t, cfg.InsecureSkipVerify, "InsecureSkipVerify should be true")
		assert.NotNil(t, cfg.VerifyConnection, "VerifyConnection should not be nil")

		// Test the verification with our server cert
		verifyConnectionState(t, cfg, testSetup.ServerCert)
	})

	t.Run("non-existent CA path returns error", func(t *testing.T) {
		ctx := context.Background()
		cfg := &tls.Config{}
		nonExistentPath := filepath.Join(testSetup.TmpDir, "nonexistent.crt")

		configFunc := MaybeWithDynamicClientCA(ctx, nonExistentPath, "localhost", 5*time.Minute, testSetup.Logger)
		err := configFunc(cfg)
		assert.Error(t, err, "Expected error with non-existent CA path")
	})

	t.Run("CA reload works", func(t *testing.T) {
		ctx, cancel := context.WithCancel(context.Background())
		defer cancel()

		cfg := &tls.Config{}
		shortInterval := 100 * time.Millisecond

		configFunc := MaybeWithDynamicClientCA(ctx, testSetup.CAPath, "localhost", shortInterval, testSetup.Logger)
		err := configFunc(cfg)
		require.NoError(t, err, "Expected no error configuring dynamic CA")

		// Generate a new CA and server cert
		newCACert, newCAPrivKey := generateTestCACert(t)
		newServerCert, _ := generateServerCert(t, "localhost", newCACert, newCAPrivKey)

		// Replace the CA file with new CA cert
		writeCertToPEMFile(t, testSetup.CAPath, newCACert)

		// Wait for reload
		time.Sleep(shortInterval * 2)

		// Verify both original and new certificates work
		verifyBothCertificates(t, cfg, testSetup.ServerCert, newServerCert)
	})
}

// verifyBothCertificates checks that both original and new certificates pass verification
func verifyBothCertificates(t *testing.T, cfg *tls.Config, originalCert, newCert *x509.Certificate) {
	// Test verification with original server cert
	originalState := tls.ConnectionState{
		PeerCertificates: []*x509.Certificate{originalCert},
	}
	assert.NoError(t, cfg.VerifyConnection(originalState),
		"Expected verification to succeed with original cert after reload")

	// Test verification with new server cert
	newState := tls.ConnectionState{
		PeerCertificates: []*x509.Certificate{newCert},
	}
	assert.NoError(t, cfg.VerifyConnection(newState),
		"Expected verification to succeed with new cert after reload")
}
