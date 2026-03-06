// Copyright 2022 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package git

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func generateTestRSAKey(t *testing.T) *rsa.PrivateKey {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	require.NoError(t, err)
	return key
}

func encodePKCS1PEM(key *rsa.PrivateKey) []byte {
	return pem.EncodeToMemory(&pem.Block{
		Type:  "RSA PRIVATE KEY",
		Bytes: x509.MarshalPKCS1PrivateKey(key),
	})
}

func encodePKCS8PEM(t *testing.T, key *rsa.PrivateKey) []byte {
	t.Helper()
	der, err := x509.MarshalPKCS8PrivateKey(key)
	require.NoError(t, err)
	return pem.EncodeToMemory(&pem.Block{
		Type:  "PRIVATE KEY",
		Bytes: der,
	})
}

func TestParseRSAPrivateKey(t *testing.T) {
	key := generateTestRSAKey(t)

	t.Run("PKCS1 PEM", func(t *testing.T) {
		pemData := encodePKCS1PEM(key)
		parsed, err := parseRSAPrivateKey(pemData)
		require.NoError(t, err)
		assert.True(t, key.Equal(parsed))
	})

	t.Run("PKCS8 PEM", func(t *testing.T) {
		pemData := encodePKCS8PEM(t, key)
		parsed, err := parseRSAPrivateKey(pemData)
		require.NoError(t, err)
		assert.True(t, key.Equal(parsed))
	})

	t.Run("invalid PEM", func(t *testing.T) {
		_, err := parseRSAPrivateKey([]byte("not a pem"))
		require.Error(t, err)
		assert.Contains(t, err.Error(), "failed to decode PEM block")
	})

	t.Run("invalid key data", func(t *testing.T) {
		pemData := pem.EncodeToMemory(&pem.Block{
			Type:  "PRIVATE KEY",
			Bytes: []byte("invalid key data"),
		})
		_, err := parseRSAPrivateKey(pemData)
		require.Error(t, err)
	})
}

func TestGitHubAppAuth_TokenRefresh(t *testing.T) {
	key := generateTestRSAKey(t)
	appID := int64(12345)
	installationID := int64(67890)

	requestCount := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requestCount++

		// Verify request path
		expectedPath := fmt.Sprintf("/app/installations/%d/access_tokens", installationID)
		assert.Equal(t, expectedPath, r.URL.Path)
		assert.Equal(t, http.MethodPost, r.Method)

		// Verify JWT in Authorization header
		authHeader := r.Header.Get("Authorization")
		require.NotEmpty(t, authHeader)
		assert.Contains(t, authHeader, "Bearer ")

		tokenString := authHeader[len("Bearer "):]
		parsedToken, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
			return &key.PublicKey, nil
		})
		require.NoError(t, err)
		assert.True(t, parsedToken.Valid)

		claims, ok := parsedToken.Claims.(jwt.MapClaims)
		require.True(t, ok)
		assert.Equal(t, fmt.Sprintf("%d", appID), claims["iss"])

		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(installationTokenResponse{
			Token:     fmt.Sprintf("ghs_test_token_%d", requestCount),
			ExpiresAt: time.Now().Add(1 * time.Hour),
		})
	}))
	defer server.Close()

	auth := &gitHubAppAuth{
		appID:          appID,
		installationID: installationID,
		privateKey:     key,
		logger:         slog.Default(),
		apiBaseURL:     server.URL,
	}

	// First call should fetch a token
	token, err := auth.getValidToken()
	require.NoError(t, err)
	assert.Equal(t, "ghs_test_token_1", token)
	assert.Equal(t, 1, requestCount)

	// Second call should use the cached token
	token, err = auth.getValidToken()
	require.NoError(t, err)
	assert.Equal(t, "ghs_test_token_1", token)
	assert.Equal(t, 1, requestCount)

	// Force expiry and verify refresh
	auth.expiry = time.Now().Add(2 * time.Minute) // within the 5-min buffer
	token, err = auth.getValidToken()
	require.NoError(t, err)
	assert.Equal(t, "ghs_test_token_2", token)
	assert.Equal(t, 2, requestCount)
}

func TestGitHubAppAuth_SetAuth(t *testing.T) {
	key := generateTestRSAKey(t)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(installationTokenResponse{
			Token:     "ghs_test_token",
			ExpiresAt: time.Now().Add(1 * time.Hour),
		})
	}))
	defer server.Close()

	auth := &gitHubAppAuth{
		appID:          1,
		installationID: 2,
		privateKey:     key,
		logger:         slog.Default(),
		apiBaseURL:     server.URL,
	}

	req := httptest.NewRequest(http.MethodGet, "https://github.com/test/repo.git", nil)
	auth.SetAuth(req)

	username, password, ok := req.BasicAuth()
	require.True(t, ok)
	assert.Equal(t, "x-access-token", username)
	assert.Equal(t, "ghs_test_token", password)
}

func TestGitHubAppAuth_NameAndString(t *testing.T) {
	auth := &gitHubAppAuth{appID: 42}
	assert.Equal(t, "http-github-app-auth", auth.Name())
	assert.Contains(t, auth.String(), "42")
}
