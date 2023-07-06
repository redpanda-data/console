package interceptor

import (
	"reflect"
	"testing"
)

func TestConsoleToKafkaConnectBigQueryHook(t *testing.T) {
	tests := []struct {
		name   string
		config map[string]any
		want   map[string]any
	}{
		{
			name: "Should pass configuration",
			config: map[string]any{
				"keySource":                  "FILE",
				"bigQueryPartitionDecorator": "true",
				"key":                        "value",
			},
			want: map[string]any{
				"keySource":                  "FILE",
				"bigQueryPartitionDecorator": "true",
				"key":                        "value",
			},
		},
		{
			name: "Should add keySource if not present",
			config: map[string]any{
				"bigQueryPartitionDecorator": "true",
				"key":                        "value",
			},
			want: map[string]any{
				"keySource":                  "JSON",
				"bigQueryPartitionDecorator": "true",
				"key":                        "value",
			},
		},
		{
			name: "Should add bigQueryPartitionDecorator if not present",
			config: map[string]any{
				"keySource": "FILE",
				"key":       "value",
			},
			want: map[string]any{
				"keySource":                  "FILE",
				"bigQueryPartitionDecorator": "false",
				"key":                        "value",
			},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := ConsoleToKafkaConnectBigQueryHook(tt.config); !reflect.DeepEqual(got, tt.want) {
				t.Errorf("ConsoleToKafkaConnectBigQueryHook() = %v, want %v", got, tt.want)
			}
		})
	}
}
