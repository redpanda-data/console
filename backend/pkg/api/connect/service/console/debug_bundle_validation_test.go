// Copyright 2024 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package console

import (
	"strings"
	"testing"

	"buf.build/go/protovalidate"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"google.golang.org/protobuf/types/known/timestamppb"

	v1alpha1 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/console/v1alpha1"
)

func TestDebugBundleLabelSelectorValidation(t *testing.T) {
	validator, err := protovalidate.New()
	require.NoError(t, err)

	tests := []struct {
		name        string
		labelKey    string
		labelValue  string
		expectValid bool
		expectedErr string
	}{
		// Valid Kubernetes label keys
		{
			name:        "simple key",
			labelKey:    "app",
			labelValue:  "redis",
			expectValid: true,
		},
		{
			name:        "kubernetes style prefix",
			labelKey:    "app.kubernetes.io/name",
			labelValue:  "redpanda-sandbox",
			expectValid: true,
		},
		{
			name:        "kubernetes style component",
			labelKey:    "app.kubernetes.io/component",
			labelValue:  "database",
			expectValid: true,
		},
		{
			name:        "custom domain prefix",
			labelKey:    "company.example.com/team",
			labelValue:  "backend",
			expectValid: true,
		},
		{
			name:        "alphanumeric key with hyphens and dots",
			labelKey:    "my-app.v1.example.com/version",
			labelValue:  "1.2.3",
			expectValid: true,
		},
		{
			name:        "key with underscores",
			labelKey:    "my_app_name",
			labelValue:  "test_value",
			expectValid: true,
		},
		{
			name:        "empty value (valid)",
			labelKey:    "optional-label",
			labelValue:  "",
			expectValid: true,
		},
		{
			name:        "maximum length key (317 chars)",
			labelKey:    "example.com/" + strings.Repeat("a", 60), // example.com/ (12) + 60 + total under 317
			labelValue:  "value",
			expectValid: true,
		},
		{
			name:        "maximum length value (63 chars)",
			labelKey:    "app",
			labelValue:  strings.Repeat("a", 63),
			expectValid: true,
		},

		// Invalid label keys
		{
			name:        "empty key",
			labelKey:    "",
			labelValue:  "value",
			expectValid: false,
			expectedErr: "string.pattern",
		},
		{
			name:        "key starts with special character",
			labelKey:    "-invalid",
			labelValue:  "value",
			expectValid: false,
			expectedErr: "string.pattern",
		},
		{
			name:        "key ends with special character",
			labelKey:    "invalid-",
			labelValue:  "value",
			expectValid: false,
			expectedErr: "string.pattern",
		},
		{
			name:        "key with slash but empty name part",
			labelKey:    "example.com/",
			labelValue:  "value",
			expectValid: false,
			expectedErr: "string.pattern",
		},
		{
			name:        "key with just slash",
			labelKey:    "/",
			labelValue:  "value",
			expectValid: false,
			expectedErr: "string.pattern",
		},
		{
			name:        "key too long (318 chars)",
			labelKey:    strings.Repeat("a", 318),
			labelValue:  "value",
			expectValid: false,
			expectedErr: "string.max_len",
		},
		{
			name:        "key with invalid characters",
			labelKey:    "app@example.com",
			labelValue:  "value",
			expectValid: false,
			expectedErr: "string.pattern",
		},
		{
			name:        "key with spaces",
			labelKey:    "my app",
			labelValue:  "value",
			expectValid: false,
			expectedErr: "string.pattern",
		},

		// Invalid label values
		{
			name:        "value starts with special character",
			labelKey:    "app",
			labelValue:  "-invalid",
			expectValid: false,
			expectedErr: "string.pattern",
		},
		{
			name:        "value ends with special character",
			labelKey:    "app",
			labelValue:  "invalid-",
			expectValid: false,
			expectedErr: "string.pattern",
		},
		{
			name:        "value too long (64 chars)",
			labelKey:    "app",
			labelValue:  strings.Repeat("a", 64),
			expectValid: false,
			expectedErr: "string.max_len",
		},
		{
			name:        "value with invalid characters",
			labelKey:    "app",
			labelValue:  "test@value",
			expectValid: false,
			expectedErr: "string.pattern",
		},
		{
			name:        "value with spaces",
			labelKey:    "app",
			labelValue:  "my value",
			expectValid: false,
			expectedErr: "string.pattern",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Create a debug bundle request with the test label selector
			request := &v1alpha1.CreateDebugBundleRequest{
				LabelSelector: []*v1alpha1.LabelSelector{
					{
						Key:   tt.labelKey,
						Value: tt.labelValue,
					},
				},
				// Add required fields to pass other validations
				ControllerLogsSizeLimitBytes: 0,
				LogsSizeLimitBytes:           0,
				MetricsIntervalSeconds:       0,
				MetricsSamples:               0,
				LogsSince:                    timestamppb.Now(),
				LogsUntil:                    timestamppb.Now(),
			}

			err := validator.Validate(request)

			if tt.expectValid {
				assert.NoError(t, err, "Expected validation to pass for label key='%s', value='%s'", tt.labelKey, tt.labelValue)
			} else {
				assert.Error(t, err, "Expected validation to fail for label key='%s', value='%s'", tt.labelKey, tt.labelValue)
				if tt.expectedErr != "" {
					assert.Contains(t, err.Error(), tt.expectedErr, "Expected error to contain '%s'", tt.expectedErr)
				}
			}
		})
	}
}

func TestDebugBundleCreateRequestValidation(t *testing.T) {
	validator, err := protovalidate.New()
	require.NoError(t, err)

	tests := []struct {
		name        string
		request     *v1alpha1.CreateDebugBundleRequest
		expectValid bool
		expectedErr string
	}{
		{
			name: "valid minimal request",
			request: &v1alpha1.CreateDebugBundleRequest{
				ControllerLogsSizeLimitBytes: 0,
				LogsSizeLimitBytes:           0,
				MetricsIntervalSeconds:       0,
				MetricsSamples:               0,
			},
			expectValid: true,
		},
		{
			name: "valid request with all fields",
			request: &v1alpha1.CreateDebugBundleRequest{
				Authentication: &v1alpha1.CreateDebugBundleRequest_Scram{
					Scram: &v1alpha1.SCRAMAuth{
						Username:  "admin",
						Password:  "password",
						Mechanism: v1alpha1.SCRAMAuth_MECHANISM_SCRAM_SHA_256,
					},
				},
				BrokerIds:                    []int32{1, 2, 3},
				ControllerLogsSizeLimitBytes: 1024,
				CpuProfilerWaitSeconds:       &[]int32{30}[0],
				LogsSizeLimitBytes:           2048,
				MetricsIntervalSeconds:       10,
				MetricsSamples:               5,
				TlsEnabled:                   true,
				TlsInsecureSkipVerify:        false,
				Namespace:                    "test-namespace",
				LabelSelector: []*v1alpha1.LabelSelector{
					{
						Key:   "app.kubernetes.io/name",
						Value: "redpanda",
					},
				},
				Partitions: []string{"kafka/test-topic/1,2,3"},
			},
			expectValid: true,
		},
		{
			name: "invalid SCRAM username too long",
			request: &v1alpha1.CreateDebugBundleRequest{
				Authentication: &v1alpha1.CreateDebugBundleRequest_Scram{
					Scram: &v1alpha1.SCRAMAuth{
						Username:  strings.Repeat("a", 129), // Too long
						Password:  "password",
						Mechanism: v1alpha1.SCRAMAuth_MECHANISM_SCRAM_SHA_256,
					},
				},
				ControllerLogsSizeLimitBytes: 0,
				LogsSizeLimitBytes:           0,
				MetricsIntervalSeconds:       0,
				MetricsSamples:               0,
			},
			expectValid: false,
			expectedErr: "string.max_len",
		},
		{
			name: "invalid SCRAM mechanism unspecified",
			request: &v1alpha1.CreateDebugBundleRequest{
				Authentication: &v1alpha1.CreateDebugBundleRequest_Scram{
					Scram: &v1alpha1.SCRAMAuth{
						Username:  "admin",
						Password:  "password",
						Mechanism: v1alpha1.SCRAMAuth_MECHANISM_UNSPECIFIED,
					},
				},
				ControllerLogsSizeLimitBytes: 0,
				LogsSizeLimitBytes:           0,
				MetricsIntervalSeconds:       0,
				MetricsSamples:               0,
			},
			expectValid: false,
			expectedErr: "required",
		},
		{
			name: "invalid controller logs size negative",
			request: &v1alpha1.CreateDebugBundleRequest{
				ControllerLogsSizeLimitBytes: -1,
				LogsSizeLimitBytes:           0,
				MetricsIntervalSeconds:       0,
				MetricsSamples:               0,
			},
			expectValid: false,
			expectedErr: "int32.gte",
		},
		{
			name: "invalid CPU profiler wait time too low",
			request: &v1alpha1.CreateDebugBundleRequest{
				CpuProfilerWaitSeconds:       &[]int32{10}[0], // Below minimum of 15
				ControllerLogsSizeLimitBytes: 0,
				LogsSizeLimitBytes:           0,
				MetricsIntervalSeconds:       0,
				MetricsSamples:               0,
			},
			expectValid: false,
			expectedErr: "int32.gte",
		},
		{
			name: "invalid namespace pattern",
			request: &v1alpha1.CreateDebugBundleRequest{
				Namespace:                    "invalid_namespace", // Underscores not allowed in namespace
				ControllerLogsSizeLimitBytes: 0,
				LogsSizeLimitBytes:           0,
				MetricsIntervalSeconds:       0,
				MetricsSamples:               0,
			},
			expectValid: false,
			expectedErr: "string.pattern",
		},
		{
			name: "invalid namespace too long",
			request: &v1alpha1.CreateDebugBundleRequest{
				Namespace:                    strings.Repeat("a", 254), // Too long
				ControllerLogsSizeLimitBytes: 0,
				LogsSizeLimitBytes:           0,
				MetricsIntervalSeconds:       0,
				MetricsSamples:               0,
			},
			expectValid: false,
			expectedErr: "string.max_len",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := validator.Validate(tt.request)

			if tt.expectValid {
				assert.NoError(t, err, "Expected validation to pass")
			} else {
				assert.Error(t, err, "Expected validation to fail")
				if tt.expectedErr != "" {
					assert.Contains(t, err.Error(), tt.expectedErr, "Expected error to contain '%s'", tt.expectedErr)
				}
			}
		})
	}
}

func TestDebugBundleLabelSelectorEdgeCases(t *testing.T) {
	validator, err := protovalidate.New()
	require.NoError(t, err)

	tests := []struct {
		name        string
		labelKey    string
		labelValue  string
		expectValid bool
		description string
	}{
		{
			name:        "RFC 1123 compliant DNS subdomain",
			labelKey:    "example.com/my-app",
			labelValue:  "v1.2.3",
			expectValid: true,
			description: "Standard Kubernetes label with DNS subdomain prefix",
		},
		{
			name:        "starts and ends with alphanumeric",
			labelKey:    "1app.example.com/name2",
			labelValue:  "3value4",
			expectValid: true,
			description: "Keys and values can start/end with numbers",
		},
		{
			name:        "mixed case characters",
			labelKey:    "App.Example.Com/MyApplication",
			labelValue:  "MyValue",
			expectValid: true,
			description: "Mixed case should be allowed",
		},
		{
			name:        "all allowed characters in middle",
			labelKey:    "a.b-c_d.example.com/x.y-z_w",
			labelValue:  "v.a-l_u.e",
			expectValid: true,
			description: "All allowed characters: dots, hyphens, underscores",
		},
		{
			name:        "prefix exactly 253 chars",
			labelKey:    strings.Repeat("a", 250) + ".com/name",
			labelValue:  "value",
			expectValid: true,
			description: "Maximum prefix length should be allowed",
		},
		{
			name:        "name part exactly 63 chars",
			labelKey:    "example.com/" + strings.Repeat("a", 63),
			labelValue:  "value",
			expectValid: true,
			description: "Maximum name length should be allowed",
		},
		{
			name:        "value exactly 63 chars",
			labelKey:    "app",
			labelValue:  strings.Repeat("a", 63),
			expectValid: true,
			description: "Maximum value length should be allowed",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			request := &v1alpha1.CreateDebugBundleRequest{
				LabelSelector: []*v1alpha1.LabelSelector{
					{
						Key:   tt.labelKey,
						Value: tt.labelValue,
					},
				},
				ControllerLogsSizeLimitBytes: 0,
				LogsSizeLimitBytes:           0,
				MetricsIntervalSeconds:       0,
				MetricsSamples:               0,
			}

			err := validator.Validate(request)

			if tt.expectValid {
				assert.NoError(t, err, "Test: %s - %s", tt.name, tt.description)
			} else {
				assert.Error(t, err, "Test: %s - %s", tt.name, tt.description)
			}
		})
	}
}
