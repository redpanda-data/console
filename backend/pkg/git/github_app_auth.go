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
	"crypto/rsa"
	"crypto/x509"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"

	"github.com/redpanda-data/console/backend/pkg/config"
)

const (
	gitHubAPIBaseURL  = "https://api.github.com"
	tokenExpiryBuffer = 5 * time.Minute
)

// gitHubAppAuth implements the go-git http.AuthMethod interface for GitHub App authentication.
// It generates short-lived installation access tokens by signing JWTs with the App's private key.
type gitHubAppAuth struct {
	appID          int64
	installationID int64
	privateKey     *rsa.PrivateKey
	logger         *slog.Logger
	apiBaseURL     string

	mu     sync.Mutex
	token  string
	expiry time.Time
}

type installationTokenResponse struct {
	Token     string    `json:"token"`
	ExpiresAt time.Time `json:"expires_at"`
}

func (a *gitHubAppAuth) SetAuth(r *http.Request) {
	token, err := a.getValidToken()
	if err != nil {
		a.logger.Error("failed to get GitHub App installation token", slog.Any("error", err))
		return
	}

	r.SetBasicAuth("x-access-token", token)
}

func (a *gitHubAppAuth) Name() string {
	return "http-github-app-auth"
}

func (a *gitHubAppAuth) String() string {
	return fmt.Sprintf("http-github-app-auth - GitHub App ID: %d", a.appID)
}

func (a *gitHubAppAuth) getValidToken() (string, error) {
	a.mu.Lock()
	defer a.mu.Unlock()

	if a.token != "" && time.Now().Before(a.expiry.Add(-tokenExpiryBuffer)) {
		return a.token, nil
	}

	return a.refreshToken()
}

func (a *gitHubAppAuth) refreshToken() (string, error) {
	now := time.Now()
	claims := jwt.RegisteredClaims{
		IssuedAt:  jwt.NewNumericDate(now),
		ExpiresAt: jwt.NewNumericDate(now.Add(10 * time.Minute)),
		Issuer:    fmt.Sprintf("%d", a.appID),
	}

	token := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
	signedJWT, err := token.SignedString(a.privateKey)
	if err != nil {
		return "", fmt.Errorf("failed to sign JWT: %w", err)
	}

	url := fmt.Sprintf("%s/app/installations/%d/access_tokens", a.apiBaseURL, a.installationID)
	req, err := http.NewRequest(http.MethodPost, url, nil)
	if err != nil {
		return "", fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Authorization", "Bearer "+signedJWT)
	req.Header.Set("Accept", "application/vnd.github+json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("failed to request installation token: %w", err)
	}

	defer resp.Body.Close()

	if resp.StatusCode != http.StatusCreated {
		body, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("GitHub API returned status %d: %s", resp.StatusCode, string(body))
	}

	var tokenResp installationTokenResponse
	if err := json.NewDecoder(resp.Body).Decode(&tokenResp); err != nil {
		return "", fmt.Errorf("failed to decode installation token response: %w", err)
	}

	a.token = tokenResp.Token
	a.expiry = tokenResp.ExpiresAt
	a.logger.Debug("refreshed GitHub App installation token",
		slog.Time("expires_at", tokenResp.ExpiresAt))

	return a.token, nil
}

func parseRSAPrivateKey(pemData []byte) (*rsa.PrivateKey, error) {
	block, _ := pem.Decode(pemData)
	if block == nil {
		return nil, fmt.Errorf("failed to decode PEM block")
	}

	// Try PKCS#1 first (RSA PRIVATE KEY)
	if key, err := x509.ParsePKCS1PrivateKey(block.Bytes); err == nil {
		return key, nil
	}

	// Try PKCS#8 (PRIVATE KEY)
	keyInterface, err := x509.ParsePKCS8PrivateKey(block.Bytes)
	if err != nil {
		return nil, fmt.Errorf("failed to parse private key (tried PKCS#1 and PKCS#8): %w", err)
	}

	key, ok := keyInterface.(*rsa.PrivateKey)
	if !ok {
		return nil, fmt.Errorf("PKCS#8 key is not an RSA private key")
	}

	return key, nil
}

func loadPrivateKeyPEM(cfg config.GitGithubApp) ([]byte, error) {
	if cfg.PrivateKey != "" {
		return []byte(cfg.PrivateKey), nil
	}

	data, err := os.ReadFile(cfg.PrivateKeyFilePath)
	if err != nil {
		return nil, fmt.Errorf("failed to read private key file %q: %w", cfg.PrivateKeyFilePath, err)
	}

	return data, nil
}

func buildGithubAppAuth(cfg config.GitGithubApp, logger *slog.Logger) (*gitHubAppAuth, error) {
	pemData, err := loadPrivateKeyPEM(cfg)
	if err != nil {
		return nil, err
	}

	privateKey, err := parseRSAPrivateKey(pemData)
	if err != nil {
		return nil, fmt.Errorf("failed to parse GitHub App private key: %w", err)
	}

	return &gitHubAppAuth{
		appID:          cfg.AppID,
		installationID: cfg.InstallationID,
		privateKey:     privateKey,
		logger:         logger,
		apiBaseURL:     gitHubAPIBaseURL,
	}, nil
}
