// Copyright 2026 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package config

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestSQL_SetDefaults(t *testing.T) {
	var c SQL
	c.Enabled = true // ensure SetDefaults resets it
	c.SetDefaults()

	if c.Enabled {
		t.Error("expected Enabled to default to false, got true")
	}
	if c.TLS.RefreshInterval == 0 {
		t.Error("expected TLS defaults to be applied")
	}
	require.Equal(t, 100, c.MaxConnections)
}

func TestSQL_Validate(t *testing.T) {
	tests := []struct {
		name    string
		cfg     SQL
		wantErr bool
	}{
		{
			name: "disabled is always valid",
			cfg:  SQL{Enabled: false},
		},
		{
			name:    "enabled without url is invalid",
			cfg:     SQL{Enabled: true},
			wantErr: true,
		},
		{
			name: "enabled with url is valid",
			cfg:  SQL{Enabled: true, URL: "rpsql:5432", MaxConnections: 100},
		},
		{
			name:    "zero maxConnections is invalid",
			cfg:     SQL{Enabled: true, URL: "rpsql:5432"},
			wantErr: true,
		},
		{
			name:    "negative maxConnections is invalid",
			cfg:     SQL{Enabled: true, URL: "rpsql:5432", MaxConnections: -1},
			wantErr: true,
		},
		{
			name: "custom maxConnections is valid",
			cfg:  SQL{Enabled: true, URL: "rpsql:5432", MaxConnections: 250},
		},
		{
			name: "impersonateUser with static bearer is invalid",
			cfg: SQL{
				Enabled:        true,
				URL:            "rpsql:5432",
				Authentication: HTTPAuthentication{ImpersonateUser: true, BearerToken: "tok"},
			},
			wantErr: true,
		},
		{
			name: "impersonateUser with basic auth username is invalid",
			cfg: SQL{
				Enabled:        true,
				URL:            "rpsql:5432",
				Authentication: HTTPAuthentication{ImpersonateUser: true, BasicAuth: HTTPBasicAuth{Username: "user"}},
			},
			wantErr: true,
		},
		{
			name: "impersonateUser alone is valid",
			cfg: SQL{
				Enabled:        true,
				URL:            "rpsql:5432",
				MaxConnections: 100,
				Authentication: HTTPAuthentication{ImpersonateUser: true},
			},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := tt.cfg.Validate()
			if tt.wantErr {
				require.Error(t, err)
				return
			}
			require.NoError(t, err)
		})
	}
}
