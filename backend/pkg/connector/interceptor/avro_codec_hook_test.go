package interceptor

import (
	"reflect"
	"testing"

	"github.com/redpanda-data/console/backend/pkg/connector/model"
)

func TestKafkaConnectToConsoleAvroCodecHook(t *testing.T) {
	type args struct {
		response model.ValidationResponse
		config   map[string]any
	}
	tests := []struct {
		name string
		args args
		want model.ValidationResponse
	}{
		{
			name: "Should make avro.codec visible in case of avro format.output.type",
			args: args{
				response: model.ValidationResponse{
					Configs: []model.ConfigDefinition{
						{
							Value: model.ConfigDefinitionValue{
								Name:    "avro.codec",
								Visible: false,
							},
						},
					},
				},
				config: map[string]any{
					"format.output.type": "avro",
				},
			},
			want: model.ValidationResponse{
				Configs: []model.ConfigDefinition{
					{
						Value: model.ConfigDefinitionValue{
							Name:    "avro.codec",
							Visible: true,
						},
					},
				},
			},
		},
		{
			name: "Should not make avro.codec visible in case of non-avro format.output.type",
			args: args{
				response: model.ValidationResponse{
					Configs: []model.ConfigDefinition{
						{
							Value: model.ConfigDefinitionValue{
								Name:    "avro.codec",
								Visible: false,
							},
						},
					},
				},
				config: map[string]any{
					"format.output.type": "json",
				},
			},
			want: model.ValidationResponse{
				Configs: []model.ConfigDefinition{
					{
						Value: model.ConfigDefinitionValue{
							Name:    "avro.codec",
							Visible: false,
						},
					},
				},
			},
		},
		{
			name: "Should not fail when avro.codec config not found",
			args: args{
				response: model.ValidationResponse{
					Configs: []model.ConfigDefinition{
						{
							Value: model.ConfigDefinitionValue{
								Name:    "avro.codec.not.found",
								Visible: false,
							},
						},
					},
				},
				config: map[string]any{
					"format.output.type": "avro",
				},
			},
			want: model.ValidationResponse{
				Configs: []model.ConfigDefinition{
					{
						Value: model.ConfigDefinitionValue{
							Name:    "avro.codec.not.found",
							Visible: false,
						},
					},
				},
			},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := KafkaConnectToConsoleAvroCodecHook(tt.args.response, tt.args.config); !reflect.DeepEqual(got, tt.want) {
				t.Errorf("KafkaConnectToConsoleAvroCodecHook() = %v, want %v", got, tt.want)
			}
		})
	}
}
