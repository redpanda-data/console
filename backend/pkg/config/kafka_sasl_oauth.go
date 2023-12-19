// Copyright 2022 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package config

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
)

// KafkaSASLOAuthBearer is the config struct for the SASL OAuthBearer mechanism
type KafkaSASLOAuthBearer struct {
	Token         string `yaml:"token"`
	ClientID      string `yaml:"clientId"`
	ClientSecret  string `yaml:"clientSecret"`
	TokenEndpoint string `yaml:"tokenEndpoint"`
	Scope         string `yaml:"scope"`
}

// RegisterFlags registers all sensitive Kerberos settings as flag
func (c *KafkaSASLOAuthBearer) RegisterFlags(f *flag.FlagSet) {
	f.StringVar(&c.Token, "kafka.sasl.oauth.token", "", "OAuth Bearer Token")
	f.StringVar(&c.ClientID, "kafka.sasl.oauth.clientId", "", "OAuth Bearer Client Id")
	f.StringVar(&c.ClientSecret, "kafka.sasl.oauth.clientSecret", "", "OAuth Bearer Client Secret")
	f.StringVar(&c.TokenEndpoint, "kafka.sasl.oauth.tokenEndpoint", "", "OAuth Bearer Token Endpoint")
	f.StringVar(&c.Scope, "kafka.sasl.oauth.scope", "", "OAuth Bearer Scope")
}

// Validate Kafka SASL OAuth configurations.
func (c *KafkaSASLOAuthBearer) Validate() error {
	if c.TokenEndpoint != "" {
		if c.ClientID == "" || c.ClientSecret == "" {
			return fmt.Errorf("OAuth Bearer client credentials must be set")
		}
	} else if c.Token == "" {
		return fmt.Errorf("OAuth Bearer token must be set")
	}

	return nil
}

// AcquireToken is used to acquire a new access token using client credentials
func (c *KafkaSASLOAuthBearer) AcquireToken(ctx context.Context) (string, error) {
	authHeaderValue := base64.StdEncoding.EncodeToString([]byte(c.ClientID + ":" + c.ClientSecret))

	queryParams := url.Values{}
	queryParams.Set("grant_type", "client_credentials")
	queryParams.Set("scope", c.Scope)

	req, err := http.NewRequestWithContext(ctx, "POST", c.TokenEndpoint, strings.NewReader(queryParams.Encode()))
	if err != nil {
		return "", err
	}

	req.URL.RawQuery = queryParams.Encode()

	req.Header.Set("Authorization", "Basic "+authHeaderValue)
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}

	if err := resp.Body.Close(); err != nil {
		return "", err
	}

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("token request failed with status code %d", resp.StatusCode)
	}

	var tokenResponse map[string]any
	err = json.Unmarshal(body, &tokenResponse)
	if err != nil {
		return "", fmt.Errorf("failed to parse token response: %s", err)
	}

	accessToken, ok := tokenResponse["access_token"].(string)
	if !ok {
		return "", fmt.Errorf("access_token not found in token response")
	}

	return accessToken, nil
}
