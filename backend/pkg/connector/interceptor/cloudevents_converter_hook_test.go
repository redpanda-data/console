package interceptor

import (
	"reflect"
	"testing"

	"github.com/redpanda-data/console/backend/pkg/connector/model"
)

func TestKafkaConnectToConsoleCloudEventsConverterHook(t *testing.T) {
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
			name: "Should pass validation response for non-CloudEventsConverter",
			args: args{
				response: model.ValidationResponse{
					Configs: []model.ConfigDefinition{
						{
							Value: model.ConfigDefinitionValue{
								Name:  "key.converter",
								Value: "io.confluent.connect.avro.AvroConverter",
							},
							Definition: model.ConfigDefinitionKey{
								Importance: model.ConfigDefinitionImportanceLow,
							},
						},
						{
							Value: model.ConfigDefinitionValue{
								Name:  "value.converter",
								Value: "io.confluent.connect.avro.AvroConverter",
							},
							Definition: model.ConfigDefinitionKey{
								Importance: model.ConfigDefinitionImportanceLow,
							},
						},
					},
				},
				config: map[string]any{},
			},

			want: model.ValidationResponse{
				Configs: []model.ConfigDefinition{
					{
						Value: model.ConfigDefinitionValue{
							Name:  "key.converter",
							Value: "io.confluent.connect.avro.AvroConverter",
						},
						Definition: model.ConfigDefinitionKey{
							Importance: model.ConfigDefinitionImportanceLow,
						},
					},
					{
						Value: model.ConfigDefinitionValue{
							Name:  "value.converter",
							Value: "io.confluent.connect.avro.AvroConverter",
						},
						Definition: model.ConfigDefinitionKey{
							Importance: model.ConfigDefinitionImportanceLow,
						},
					},
					{
						Definition: model.ConfigDefinitionKey{
							Name:          "key.converter.serializer.type",
							Type:          "STRING",
							DefaultValue:  "json",
							Importance:    model.ConfigDefinitionImportanceLow,
							Required:      false,
							DisplayName:   "Message key serializer type",
							Documentation: "The encoding type to use for the CloudEvents envelope structure",
						},
						Value: model.ConfigDefinitionValue{
							Name:              "key.converter.serializer.type",
							Value:             "json",
							RecommendedValues: []string{},
							Visible:           false,
							Errors:            []string{},
						},
						Metadata: model.ConfigDefinitionMetadata{
							ComponentType: model.ComponentRadioGroup,
							RecommendedValues: []model.RecommendedValueWithMetadata{
								{Value: "avro", DisplayName: "AVRO"},
								{Value: "json", DisplayName: "JSON"},
							},
						},
					},
					{
						Definition: model.ConfigDefinitionKey{
							Name:          "key.converter.data.serializer.type",
							Type:          "STRING",
							DefaultValue:  "json",
							Importance:    model.ConfigDefinitionImportanceLow,
							Required:      false,
							DisplayName:   "Message key data serializer type",
							Documentation: "The encoding type to use for the data attribute",
						},
						Value: model.ConfigDefinitionValue{
							Name:              "key.converter.data.serializer.type",
							Value:             "json",
							RecommendedValues: []string{},
							Visible:           false,
							Errors:            []string{},
						},
						Metadata: model.ConfigDefinitionMetadata{
							ComponentType: model.ComponentRadioGroup,
							RecommendedValues: []model.RecommendedValueWithMetadata{
								{Value: "avro", DisplayName: "AVRO"},
								{Value: "json", DisplayName: "JSON"},
							},
						},
					},
					{
						Definition: model.ConfigDefinitionKey{
							Name:          "key.converter.json.schemas.enable",
							Type:          "BOOLEAN",
							DefaultValue:  "true",
							Importance:    model.ConfigDefinitionImportanceLow,
							Required:      false,
							DisplayName:   "Message key CloudEvents JSON contains schema",
							Documentation: "Whether your message key contains schema in the schema field",
						},
						Value: model.ConfigDefinitionValue{
							Name:              "key.converter.json.schemas.enable",
							Value:             "true",
							RecommendedValues: []string{"true", "false"},
							Visible:           false,
							Errors:            []string{},
						},
					},
					{
						Definition: model.ConfigDefinitionKey{
							Name:          "value.converter.serializer.type",
							Type:          "STRING",
							DefaultValue:  "json",
							Importance:    model.ConfigDefinitionImportanceLow,
							Required:      false,
							DisplayName:   "Message value serializer type",
							Documentation: "The encoding type to use for the CloudEvents envelope structure",
						},
						Value: model.ConfigDefinitionValue{
							Name:              "value.converter.serializer.type",
							Value:             "json",
							RecommendedValues: []string{},
							Visible:           false,
							Errors:            []string{},
						},
						Metadata: model.ConfigDefinitionMetadata{
							ComponentType: model.ComponentRadioGroup,
							RecommendedValues: []model.RecommendedValueWithMetadata{
								{Value: "avro", DisplayName: "AVRO"},
								{Value: "json", DisplayName: "JSON"},
							},
						},
					},
					{
						Definition: model.ConfigDefinitionKey{
							Name:          "value.converter.data.serializer.type",
							Type:          "STRING",
							DefaultValue:  "json",
							Importance:    model.ConfigDefinitionImportanceLow,
							Required:      false,
							DisplayName:   "Message value data serializer type",
							Documentation: "The encoding type to use for the data attribute",
						},
						Value: model.ConfigDefinitionValue{
							Name:              "value.converter.data.serializer.type",
							Value:             "json",
							RecommendedValues: []string{},
							Visible:           false,
							Errors:            []string{},
						},
						Metadata: model.ConfigDefinitionMetadata{
							ComponentType: model.ComponentRadioGroup,
							RecommendedValues: []model.RecommendedValueWithMetadata{
								{Value: "avro", DisplayName: "AVRO"},
								{Value: "json", DisplayName: "JSON"},
							},
						},
					},
					{
						Definition: model.ConfigDefinitionKey{
							Name:          "value.converter.json.schemas.enable",
							Type:          "BOOLEAN",
							DefaultValue:  "true",
							Importance:    model.ConfigDefinitionImportanceLow,
							Required:      false,
							DisplayName:   "Message value CloudEvents JSON contains schema",
							Documentation: "Whether your message value contains schema in the schema field",
						},
						Value: model.ConfigDefinitionValue{
							Name:              "value.converter.json.schemas.enable",
							Value:             "true",
							RecommendedValues: []string{"true", "false"},
							Visible:           false,
							Errors:            []string{},
						},
					},
				},
			},
		},
		{
			name: "Should show key serializer types for CloudEventsConverter",
			args: args{
				response: model.ValidationResponse{
					Configs: []model.ConfigDefinition{
						{
							Value: model.ConfigDefinitionValue{
								Name:  "key.converter",
								Value: "io.debezium.converters.CloudEventsConverter",
							},
							Definition: model.ConfigDefinitionKey{
								Importance: model.ConfigDefinitionImportanceLow,
							},
						},
						{
							Value: model.ConfigDefinitionValue{
								Name:  "value.converter",
								Value: "io.confluent.connect.avro.AvroConverter",
							},
							Definition: model.ConfigDefinitionKey{
								Importance: model.ConfigDefinitionImportanceLow,
							},
						},
					},
				},
				config: map[string]any{},
			},

			want: model.ValidationResponse{
				Configs: []model.ConfigDefinition{
					{
						Value: model.ConfigDefinitionValue{
							Name:  "key.converter",
							Value: "io.debezium.converters.CloudEventsConverter",
						},
						Definition: model.ConfigDefinitionKey{
							Importance: model.ConfigDefinitionImportanceLow,
						},
					},
					{
						Value: model.ConfigDefinitionValue{
							Name:  "value.converter",
							Value: "io.confluent.connect.avro.AvroConverter",
						},
						Definition: model.ConfigDefinitionKey{
							Importance: model.ConfigDefinitionImportanceLow,
						},
					},
					{
						Definition: model.ConfigDefinitionKey{
							Name:          "key.converter.serializer.type",
							Type:          "STRING",
							DefaultValue:  "json",
							Importance:    model.ConfigDefinitionImportanceLow,
							Required:      false,
							DisplayName:   "Message key serializer type",
							Documentation: "The encoding type to use for the CloudEvents envelope structure",
						},
						Value: model.ConfigDefinitionValue{
							Name:              "key.converter.serializer.type",
							Value:             "json",
							RecommendedValues: []string{},
							Visible:           true,
							Errors:            []string{},
						},
						Metadata: model.ConfigDefinitionMetadata{
							ComponentType: model.ComponentRadioGroup,
							RecommendedValues: []model.RecommendedValueWithMetadata{
								{Value: "avro", DisplayName: "AVRO"},
								{Value: "json", DisplayName: "JSON"},
							},
						},
					},
					{
						Definition: model.ConfigDefinitionKey{
							Name:          "key.converter.data.serializer.type",
							Type:          "STRING",
							DefaultValue:  "json",
							Importance:    model.ConfigDefinitionImportanceLow,
							Required:      false,
							DisplayName:   "Message key data serializer type",
							Documentation: "The encoding type to use for the data attribute",
						},
						Value: model.ConfigDefinitionValue{
							Name:              "key.converter.data.serializer.type",
							Value:             "json",
							RecommendedValues: []string{},
							Visible:           true,
							Errors:            []string{},
						},
						Metadata: model.ConfigDefinitionMetadata{
							ComponentType: model.ComponentRadioGroup,
							RecommendedValues: []model.RecommendedValueWithMetadata{
								{Value: "avro", DisplayName: "AVRO"},
								{Value: "json", DisplayName: "JSON"},
							},
						},
					},
					{
						Definition: model.ConfigDefinitionKey{
							Name:          "key.converter.json.schemas.enable",
							Type:          "BOOLEAN",
							DefaultValue:  "true",
							Importance:    model.ConfigDefinitionImportanceLow,
							Required:      false,
							DisplayName:   "Message key CloudEvents JSON contains schema",
							Documentation: "Whether your message key contains schema in the schema field",
						},
						Value: model.ConfigDefinitionValue{
							Name:              "key.converter.json.schemas.enable",
							Value:             "true",
							RecommendedValues: []string{"true", "false"},
							Visible:           true,
							Errors:            []string{},
						},
					},
					{
						Definition: model.ConfigDefinitionKey{
							Name:          "value.converter.serializer.type",
							Type:          "STRING",
							DefaultValue:  "json",
							Importance:    model.ConfigDefinitionImportanceLow,
							Required:      false,
							DisplayName:   "Message value serializer type",
							Documentation: "The encoding type to use for the CloudEvents envelope structure",
						},
						Value: model.ConfigDefinitionValue{
							Name:              "value.converter.serializer.type",
							Value:             "json",
							RecommendedValues: []string{},
							Visible:           false,
							Errors:            []string{},
						},
						Metadata: model.ConfigDefinitionMetadata{
							ComponentType: model.ComponentRadioGroup,
							RecommendedValues: []model.RecommendedValueWithMetadata{
								{Value: "avro", DisplayName: "AVRO"},
								{Value: "json", DisplayName: "JSON"},
							},
						},
					},
					{
						Definition: model.ConfigDefinitionKey{
							Name:          "value.converter.data.serializer.type",
							Type:          "STRING",
							DefaultValue:  "json",
							Importance:    model.ConfigDefinitionImportanceLow,
							Required:      false,
							DisplayName:   "Message value data serializer type",
							Documentation: "The encoding type to use for the data attribute",
						},
						Value: model.ConfigDefinitionValue{
							Name:              "value.converter.data.serializer.type",
							Value:             "json",
							RecommendedValues: []string{},
							Visible:           false,
							Errors:            []string{},
						},
						Metadata: model.ConfigDefinitionMetadata{
							ComponentType: model.ComponentRadioGroup,
							RecommendedValues: []model.RecommendedValueWithMetadata{
								{Value: "avro", DisplayName: "AVRO"},
								{Value: "json", DisplayName: "JSON"},
							},
						},
					},
					{
						Definition: model.ConfigDefinitionKey{
							Name:          "value.converter.json.schemas.enable",
							Type:          "BOOLEAN",
							DefaultValue:  "true",
							Importance:    model.ConfigDefinitionImportanceLow,
							Required:      false,
							DisplayName:   "Message value CloudEvents JSON contains schema",
							Documentation: "Whether your message value contains schema in the schema field",
						},
						Value: model.ConfigDefinitionValue{
							Name:              "value.converter.json.schemas.enable",
							Value:             "true",
							RecommendedValues: []string{"true", "false"},
							Visible:           false,
							Errors:            []string{},
						},
					},
				},
			},
		},
		{
			name: "Should show key serializer types for CloudEventsConverter and hide schemas enabled when avro",
			args: args{
				response: model.ValidationResponse{
					Configs: []model.ConfigDefinition{
						{
							Value: model.ConfigDefinitionValue{
								Name:  "key.converter",
								Value: "io.debezium.converters.CloudEventsConverter",
							},
							Definition: model.ConfigDefinitionKey{
								Importance: model.ConfigDefinitionImportanceLow,
							},
						},
						{
							Value: model.ConfigDefinitionValue{
								Name:  "value.converter",
								Value: "io.confluent.connect.avro.AvroConverter",
							},
							Definition: model.ConfigDefinitionKey{
								Importance: model.ConfigDefinitionImportanceLow,
							},
						},
					},
				},
				config: map[string]any{
					"key.converter.data.serializer.type": "avro",
				},
			},

			want: model.ValidationResponse{
				Configs: []model.ConfigDefinition{
					{
						Value: model.ConfigDefinitionValue{
							Name:  "key.converter",
							Value: "io.debezium.converters.CloudEventsConverter",
						},
						Definition: model.ConfigDefinitionKey{
							Importance: model.ConfigDefinitionImportanceLow,
						},
					},
					{
						Value: model.ConfigDefinitionValue{
							Name:  "value.converter",
							Value: "io.confluent.connect.avro.AvroConverter",
						},
						Definition: model.ConfigDefinitionKey{
							Importance: model.ConfigDefinitionImportanceLow,
						},
					},
					{
						Definition: model.ConfigDefinitionKey{
							Name:          "key.converter.serializer.type",
							Type:          "STRING",
							DefaultValue:  "json",
							Importance:    model.ConfigDefinitionImportanceLow,
							Required:      false,
							DisplayName:   "Message key serializer type",
							Documentation: "The encoding type to use for the CloudEvents envelope structure",
						},
						Value: model.ConfigDefinitionValue{
							Name:              "key.converter.serializer.type",
							Value:             "json",
							RecommendedValues: []string{},
							Visible:           true,
							Errors:            []string{},
						},
						Metadata: model.ConfigDefinitionMetadata{
							ComponentType: model.ComponentRadioGroup,
							RecommendedValues: []model.RecommendedValueWithMetadata{
								{Value: "avro", DisplayName: "AVRO"},
								{Value: "json", DisplayName: "JSON"},
							},
						},
					},
					{
						Definition: model.ConfigDefinitionKey{
							Name:          "key.converter.data.serializer.type",
							Type:          "STRING",
							DefaultValue:  "json",
							Importance:    model.ConfigDefinitionImportanceLow,
							Required:      false,
							DisplayName:   "Message key data serializer type",
							Documentation: "The encoding type to use for the data attribute",
						},
						Value: model.ConfigDefinitionValue{
							Name:              "key.converter.data.serializer.type",
							Value:             "avro",
							RecommendedValues: []string{},
							Visible:           true,
							Errors:            []string{},
						},
						Metadata: model.ConfigDefinitionMetadata{
							ComponentType: model.ComponentRadioGroup,
							RecommendedValues: []model.RecommendedValueWithMetadata{
								{Value: "avro", DisplayName: "AVRO"},
								{Value: "json", DisplayName: "JSON"},
							},
						},
					},
					{
						Definition: model.ConfigDefinitionKey{
							Name:          "key.converter.json.schemas.enable",
							Type:          "BOOLEAN",
							DefaultValue:  "true",
							Importance:    model.ConfigDefinitionImportanceLow,
							Required:      false,
							DisplayName:   "Message key CloudEvents JSON contains schema",
							Documentation: "Whether your message key contains schema in the schema field",
						},
						Value: model.ConfigDefinitionValue{
							Name:              "key.converter.json.schemas.enable",
							Value:             "true",
							RecommendedValues: []string{"true", "false"},
							Visible:           false,
							Errors:            []string{},
						},
					},
					{
						Definition: model.ConfigDefinitionKey{
							Name:          "value.converter.serializer.type",
							Type:          "STRING",
							DefaultValue:  "json",
							Importance:    model.ConfigDefinitionImportanceLow,
							Required:      false,
							DisplayName:   "Message value serializer type",
							Documentation: "The encoding type to use for the CloudEvents envelope structure",
						},
						Value: model.ConfigDefinitionValue{
							Name:              "value.converter.serializer.type",
							Value:             "json",
							RecommendedValues: []string{},
							Visible:           false,
							Errors:            []string{},
						},
						Metadata: model.ConfigDefinitionMetadata{
							ComponentType: model.ComponentRadioGroup,
							RecommendedValues: []model.RecommendedValueWithMetadata{
								{Value: "avro", DisplayName: "AVRO"},
								{Value: "json", DisplayName: "JSON"},
							},
						},
					},
					{
						Definition: model.ConfigDefinitionKey{
							Name:          "value.converter.data.serializer.type",
							Type:          "STRING",
							DefaultValue:  "json",
							Importance:    model.ConfigDefinitionImportanceLow,
							Required:      false,
							DisplayName:   "Message value data serializer type",
							Documentation: "The encoding type to use for the data attribute",
						},
						Value: model.ConfigDefinitionValue{
							Name:              "value.converter.data.serializer.type",
							Value:             "json",
							RecommendedValues: []string{},
							Visible:           false,
							Errors:            []string{},
						},
						Metadata: model.ConfigDefinitionMetadata{
							ComponentType: model.ComponentRadioGroup,
							RecommendedValues: []model.RecommendedValueWithMetadata{
								{Value: "avro", DisplayName: "AVRO"},
								{Value: "json", DisplayName: "JSON"},
							},
						},
					},
					{
						Definition: model.ConfigDefinitionKey{
							Name:          "value.converter.json.schemas.enable",
							Type:          "BOOLEAN",
							DefaultValue:  "true",
							Importance:    model.ConfigDefinitionImportanceLow,
							Required:      false,
							DisplayName:   "Message value CloudEvents JSON contains schema",
							Documentation: "Whether your message value contains schema in the schema field",
						},
						Value: model.ConfigDefinitionValue{
							Name:              "value.converter.json.schemas.enable",
							Value:             "true",
							RecommendedValues: []string{"true", "false"},
							Visible:           false,
							Errors:            []string{},
						},
					},
				},
			},
		},
		{
			name: "Should show key serializer types for CloudEventsConverter and proper schemas enabled value",
			args: args{
				response: model.ValidationResponse{
					Configs: []model.ConfigDefinition{
						{
							Value: model.ConfigDefinitionValue{
								Name:  "key.converter",
								Value: "io.debezium.converters.CloudEventsConverter",
							},
							Definition: model.ConfigDefinitionKey{
								Importance: model.ConfigDefinitionImportanceLow,
							},
						},
						{
							Value: model.ConfigDefinitionValue{
								Name:  "value.converter",
								Value: "io.confluent.connect.avro.AvroConverter",
							},
							Definition: model.ConfigDefinitionKey{
								Importance: model.ConfigDefinitionImportanceLow,
							},
						},
					},
				},
				config: map[string]any{
					"key.converter.data.serializer.type": "json",
					"key.converter.json.schemas.enable":  "false",
				},
			},

			want: model.ValidationResponse{
				Configs: []model.ConfigDefinition{
					{
						Value: model.ConfigDefinitionValue{
							Name:  "key.converter",
							Value: "io.debezium.converters.CloudEventsConverter",
						},
						Definition: model.ConfigDefinitionKey{
							Importance: model.ConfigDefinitionImportanceLow,
						},
					},
					{
						Value: model.ConfigDefinitionValue{
							Name:  "value.converter",
							Value: "io.confluent.connect.avro.AvroConverter",
						},
						Definition: model.ConfigDefinitionKey{
							Importance: model.ConfigDefinitionImportanceLow,
						},
					},
					{
						Definition: model.ConfigDefinitionKey{
							Name:          "key.converter.serializer.type",
							Type:          "STRING",
							DefaultValue:  "json",
							Importance:    model.ConfigDefinitionImportanceLow,
							Required:      false,
							DisplayName:   "Message key serializer type",
							Documentation: "The encoding type to use for the CloudEvents envelope structure",
						},
						Value: model.ConfigDefinitionValue{
							Name:              "key.converter.serializer.type",
							Value:             "json",
							RecommendedValues: []string{},
							Visible:           true,
							Errors:            []string{},
						},
						Metadata: model.ConfigDefinitionMetadata{
							ComponentType: model.ComponentRadioGroup,
							RecommendedValues: []model.RecommendedValueWithMetadata{
								{Value: "avro", DisplayName: "AVRO"},
								{Value: "json", DisplayName: "JSON"},
							},
						},
					},
					{
						Definition: model.ConfigDefinitionKey{
							Name:          "key.converter.data.serializer.type",
							Type:          "STRING",
							DefaultValue:  "json",
							Importance:    model.ConfigDefinitionImportanceLow,
							Required:      false,
							DisplayName:   "Message key data serializer type",
							Documentation: "The encoding type to use for the data attribute",
						},
						Value: model.ConfigDefinitionValue{
							Name:              "key.converter.data.serializer.type",
							Value:             "json",
							RecommendedValues: []string{},
							Visible:           true,
							Errors:            []string{},
						},
						Metadata: model.ConfigDefinitionMetadata{
							ComponentType: model.ComponentRadioGroup,
							RecommendedValues: []model.RecommendedValueWithMetadata{
								{Value: "avro", DisplayName: "AVRO"},
								{Value: "json", DisplayName: "JSON"},
							},
						},
					},
					{
						Definition: model.ConfigDefinitionKey{
							Name:          "key.converter.json.schemas.enable",
							Type:          "BOOLEAN",
							DefaultValue:  "true",
							Importance:    model.ConfigDefinitionImportanceLow,
							Required:      false,
							DisplayName:   "Message key CloudEvents JSON contains schema",
							Documentation: "Whether your message key contains schema in the schema field",
						},
						Value: model.ConfigDefinitionValue{
							Name:              "key.converter.json.schemas.enable",
							Value:             "false",
							RecommendedValues: []string{"true", "false"},
							Visible:           true,
							Errors:            []string{},
						},
					},
					{
						Definition: model.ConfigDefinitionKey{
							Name:          "value.converter.serializer.type",
							Type:          "STRING",
							DefaultValue:  "json",
							Importance:    model.ConfigDefinitionImportanceLow,
							Required:      false,
							DisplayName:   "Message value serializer type",
							Documentation: "The encoding type to use for the CloudEvents envelope structure",
						},
						Value: model.ConfigDefinitionValue{
							Name:              "value.converter.serializer.type",
							Value:             "json",
							RecommendedValues: []string{},
							Visible:           false,
							Errors:            []string{},
						},
						Metadata: model.ConfigDefinitionMetadata{
							ComponentType: model.ComponentRadioGroup,
							RecommendedValues: []model.RecommendedValueWithMetadata{
								{Value: "avro", DisplayName: "AVRO"},
								{Value: "json", DisplayName: "JSON"},
							},
						},
					},
					{
						Definition: model.ConfigDefinitionKey{
							Name:          "value.converter.data.serializer.type",
							Type:          "STRING",
							DefaultValue:  "json",
							Importance:    model.ConfigDefinitionImportanceLow,
							Required:      false,
							DisplayName:   "Message value data serializer type",
							Documentation: "The encoding type to use for the data attribute",
						},
						Value: model.ConfigDefinitionValue{
							Name:              "value.converter.data.serializer.type",
							Value:             "json",
							RecommendedValues: []string{},
							Visible:           false,
							Errors:            []string{},
						},
						Metadata: model.ConfigDefinitionMetadata{
							ComponentType: model.ComponentRadioGroup,
							RecommendedValues: []model.RecommendedValueWithMetadata{
								{Value: "avro", DisplayName: "AVRO"},
								{Value: "json", DisplayName: "JSON"},
							},
						},
					},
					{
						Definition: model.ConfigDefinitionKey{
							Name:          "value.converter.json.schemas.enable",
							Type:          "BOOLEAN",
							DefaultValue:  "true",
							Importance:    model.ConfigDefinitionImportanceLow,
							Required:      false,
							DisplayName:   "Message value CloudEvents JSON contains schema",
							Documentation: "Whether your message value contains schema in the schema field",
						},
						Value: model.ConfigDefinitionValue{
							Name:              "value.converter.json.schemas.enable",
							Value:             "true",
							RecommendedValues: []string{"true", "false"},
							Visible:           false,
							Errors:            []string{},
						},
					},
				},
			},
		},
		{
			name: "Should show value serializer types for CloudEventsConverter",
			args: args{
				response: model.ValidationResponse{
					Configs: []model.ConfigDefinition{
						{
							Value: model.ConfigDefinitionValue{
								Name:  "key.converter",
								Value: "io.confluent.connect.avro.AvroConverter",
							},
							Definition: model.ConfigDefinitionKey{
								Importance: model.ConfigDefinitionImportanceLow,
							},
						},
						{
							Value: model.ConfigDefinitionValue{
								Name:  "value.converter",
								Value: "io.debezium.converters.CloudEventsConverter",
							},
							Definition: model.ConfigDefinitionKey{
								Importance: model.ConfigDefinitionImportanceLow,
							},
						},
					},
				},
				config: map[string]any{},
			},

			want: model.ValidationResponse{
				Configs: []model.ConfigDefinition{
					{
						Value: model.ConfigDefinitionValue{
							Name:  "key.converter",
							Value: "io.confluent.connect.avro.AvroConverter",
						},
						Definition: model.ConfigDefinitionKey{
							Importance: model.ConfigDefinitionImportanceLow,
						},
					},
					{
						Value: model.ConfigDefinitionValue{
							Name:  "value.converter",
							Value: "io.debezium.converters.CloudEventsConverter",
						},
						Definition: model.ConfigDefinitionKey{
							Importance: model.ConfigDefinitionImportanceLow,
						},
					},
					{
						Definition: model.ConfigDefinitionKey{
							Name:          "key.converter.serializer.type",
							Type:          "STRING",
							DefaultValue:  "json",
							Importance:    model.ConfigDefinitionImportanceLow,
							Required:      false,
							DisplayName:   "Message key serializer type",
							Documentation: "The encoding type to use for the CloudEvents envelope structure",
						},
						Value: model.ConfigDefinitionValue{
							Name:              "key.converter.serializer.type",
							Value:             "json",
							RecommendedValues: []string{},
							Visible:           false,
							Errors:            []string{},
						},
						Metadata: model.ConfigDefinitionMetadata{
							ComponentType: model.ComponentRadioGroup,
							RecommendedValues: []model.RecommendedValueWithMetadata{
								{Value: "avro", DisplayName: "AVRO"},
								{Value: "json", DisplayName: "JSON"},
							},
						},
					},
					{
						Definition: model.ConfigDefinitionKey{
							Name:          "key.converter.data.serializer.type",
							Type:          "STRING",
							DefaultValue:  "json",
							Importance:    model.ConfigDefinitionImportanceLow,
							Required:      false,
							DisplayName:   "Message key data serializer type",
							Documentation: "The encoding type to use for the data attribute",
						},
						Value: model.ConfigDefinitionValue{
							Name:              "key.converter.data.serializer.type",
							Value:             "json",
							RecommendedValues: []string{},
							Visible:           false,
							Errors:            []string{},
						},
						Metadata: model.ConfigDefinitionMetadata{
							ComponentType: model.ComponentRadioGroup,
							RecommendedValues: []model.RecommendedValueWithMetadata{
								{Value: "avro", DisplayName: "AVRO"},
								{Value: "json", DisplayName: "JSON"},
							},
						},
					},
					{
						Definition: model.ConfigDefinitionKey{
							Name:          "key.converter.json.schemas.enable",
							Type:          "BOOLEAN",
							DefaultValue:  "true",
							Importance:    model.ConfigDefinitionImportanceLow,
							Required:      false,
							DisplayName:   "Message key CloudEvents JSON contains schema",
							Documentation: "Whether your message key contains schema in the schema field",
						},
						Value: model.ConfigDefinitionValue{
							Name:              "key.converter.json.schemas.enable",
							Value:             "true",
							RecommendedValues: []string{"true", "false"},
							Visible:           false,
							Errors:            []string{},
						},
					},
					{
						Definition: model.ConfigDefinitionKey{
							Name:          "value.converter.serializer.type",
							Type:          "STRING",
							DefaultValue:  "json",
							Importance:    model.ConfigDefinitionImportanceLow,
							Required:      false,
							DisplayName:   "Message value serializer type",
							Documentation: "The encoding type to use for the CloudEvents envelope structure",
						},
						Value: model.ConfigDefinitionValue{
							Name:              "value.converter.serializer.type",
							Value:             "json",
							RecommendedValues: []string{},
							Visible:           true,
							Errors:            []string{},
						},
						Metadata: model.ConfigDefinitionMetadata{
							ComponentType: model.ComponentRadioGroup,
							RecommendedValues: []model.RecommendedValueWithMetadata{
								{Value: "avro", DisplayName: "AVRO"},
								{Value: "json", DisplayName: "JSON"},
							},
						},
					},
					{
						Definition: model.ConfigDefinitionKey{
							Name:          "value.converter.data.serializer.type",
							Type:          "STRING",
							DefaultValue:  "json",
							Importance:    model.ConfigDefinitionImportanceLow,
							Required:      false,
							DisplayName:   "Message value data serializer type",
							Documentation: "The encoding type to use for the data attribute",
						},
						Value: model.ConfigDefinitionValue{
							Name:              "value.converter.data.serializer.type",
							Value:             "json",
							RecommendedValues: []string{},
							Visible:           true,
							Errors:            []string{},
						},
						Metadata: model.ConfigDefinitionMetadata{
							ComponentType: model.ComponentRadioGroup,
							RecommendedValues: []model.RecommendedValueWithMetadata{
								{Value: "avro", DisplayName: "AVRO"},
								{Value: "json", DisplayName: "JSON"},
							},
						},
					},
					{
						Definition: model.ConfigDefinitionKey{
							Name:          "value.converter.json.schemas.enable",
							Type:          "BOOLEAN",
							DefaultValue:  "true",
							Importance:    model.ConfigDefinitionImportanceLow,
							Required:      false,
							DisplayName:   "Message value CloudEvents JSON contains schema",
							Documentation: "Whether your message value contains schema in the schema field",
						},
						Value: model.ConfigDefinitionValue{
							Name:              "value.converter.json.schemas.enable",
							Value:             "true",
							RecommendedValues: []string{"true", "false"},
							Visible:           true,
							Errors:            []string{},
						},
					},
				},
			},
		},
		{
			name: "Should show value serializer types for CloudEventsConverter and hide schemas enabled when avro",
			args: args{
				response: model.ValidationResponse{
					Configs: []model.ConfigDefinition{
						{
							Value: model.ConfigDefinitionValue{
								Name:  "key.converter",
								Value: "io.confluent.connect.avro.AvroConverter",
							},
							Definition: model.ConfigDefinitionKey{
								Importance: model.ConfigDefinitionImportanceLow,
							},
						},
						{
							Value: model.ConfigDefinitionValue{
								Name:  "value.converter",
								Value: "io.debezium.converters.CloudEventsConverter",
							},
							Definition: model.ConfigDefinitionKey{
								Importance: model.ConfigDefinitionImportanceLow,
							},
						},
					},
				},
				config: map[string]any{
					"value.converter.data.serializer.type": "avro",
				},
			},

			want: model.ValidationResponse{
				Configs: []model.ConfigDefinition{
					{
						Value: model.ConfigDefinitionValue{
							Name:  "key.converter",
							Value: "io.confluent.connect.avro.AvroConverter",
						},
						Definition: model.ConfigDefinitionKey{
							Importance: model.ConfigDefinitionImportanceLow,
						},
					},
					{
						Value: model.ConfigDefinitionValue{
							Name:  "value.converter",
							Value: "io.debezium.converters.CloudEventsConverter",
						},
						Definition: model.ConfigDefinitionKey{
							Importance: model.ConfigDefinitionImportanceLow,
						},
					},
					{
						Definition: model.ConfigDefinitionKey{
							Name:          "key.converter.serializer.type",
							Type:          "STRING",
							DefaultValue:  "json",
							Importance:    model.ConfigDefinitionImportanceLow,
							Required:      false,
							DisplayName:   "Message key serializer type",
							Documentation: "The encoding type to use for the CloudEvents envelope structure",
						},
						Value: model.ConfigDefinitionValue{
							Name:              "key.converter.serializer.type",
							Value:             "json",
							RecommendedValues: []string{},
							Visible:           false,
							Errors:            []string{},
						},
						Metadata: model.ConfigDefinitionMetadata{
							ComponentType: model.ComponentRadioGroup,
							RecommendedValues: []model.RecommendedValueWithMetadata{
								{Value: "avro", DisplayName: "AVRO"},
								{Value: "json", DisplayName: "JSON"},
							},
						},
					},
					{
						Definition: model.ConfigDefinitionKey{
							Name:          "key.converter.data.serializer.type",
							Type:          "STRING",
							DefaultValue:  "json",
							Importance:    model.ConfigDefinitionImportanceLow,
							Required:      false,
							DisplayName:   "Message key data serializer type",
							Documentation: "The encoding type to use for the data attribute",
						},
						Value: model.ConfigDefinitionValue{
							Name:              "key.converter.data.serializer.type",
							Value:             "json",
							RecommendedValues: []string{},
							Visible:           false,
							Errors:            []string{},
						},
						Metadata: model.ConfigDefinitionMetadata{
							ComponentType: model.ComponentRadioGroup,
							RecommendedValues: []model.RecommendedValueWithMetadata{
								{Value: "avro", DisplayName: "AVRO"},
								{Value: "json", DisplayName: "JSON"},
							},
						},
					},
					{
						Definition: model.ConfigDefinitionKey{
							Name:          "key.converter.json.schemas.enable",
							Type:          "BOOLEAN",
							DefaultValue:  "true",
							Importance:    model.ConfigDefinitionImportanceLow,
							Required:      false,
							DisplayName:   "Message key CloudEvents JSON contains schema",
							Documentation: "Whether your message key contains schema in the schema field",
						},
						Value: model.ConfigDefinitionValue{
							Name:              "key.converter.json.schemas.enable",
							Value:             "true",
							RecommendedValues: []string{"true", "false"},
							Visible:           false,
							Errors:            []string{},
						},
					},
					{
						Definition: model.ConfigDefinitionKey{
							Name:          "value.converter.serializer.type",
							Type:          "STRING",
							DefaultValue:  "json",
							Importance:    model.ConfigDefinitionImportanceLow,
							Required:      false,
							DisplayName:   "Message value serializer type",
							Documentation: "The encoding type to use for the CloudEvents envelope structure",
						},
						Value: model.ConfigDefinitionValue{
							Name:              "value.converter.serializer.type",
							Value:             "json",
							RecommendedValues: []string{},
							Visible:           true,
							Errors:            []string{},
						},
						Metadata: model.ConfigDefinitionMetadata{
							ComponentType: model.ComponentRadioGroup,
							RecommendedValues: []model.RecommendedValueWithMetadata{
								{Value: "avro", DisplayName: "AVRO"},
								{Value: "json", DisplayName: "JSON"},
							},
						},
					},
					{
						Definition: model.ConfigDefinitionKey{
							Name:          "value.converter.data.serializer.type",
							Type:          "STRING",
							DefaultValue:  "json",
							Importance:    model.ConfigDefinitionImportanceLow,
							Required:      false,
							DisplayName:   "Message value data serializer type",
							Documentation: "The encoding type to use for the data attribute",
						},
						Value: model.ConfigDefinitionValue{
							Name:              "value.converter.data.serializer.type",
							Value:             "avro",
							RecommendedValues: []string{},
							Visible:           true,
							Errors:            []string{},
						},
						Metadata: model.ConfigDefinitionMetadata{
							ComponentType: model.ComponentRadioGroup,
							RecommendedValues: []model.RecommendedValueWithMetadata{
								{Value: "avro", DisplayName: "AVRO"},
								{Value: "json", DisplayName: "JSON"},
							},
						},
					},
					{
						Definition: model.ConfigDefinitionKey{
							Name:          "value.converter.json.schemas.enable",
							Type:          "BOOLEAN",
							DefaultValue:  "true",
							Importance:    model.ConfigDefinitionImportanceLow,
							Required:      false,
							DisplayName:   "Message value CloudEvents JSON contains schema",
							Documentation: "Whether your message value contains schema in the schema field",
						},
						Value: model.ConfigDefinitionValue{
							Name:              "value.converter.json.schemas.enable",
							Value:             "true",
							RecommendedValues: []string{"true", "false"},
							Visible:           false,
							Errors:            []string{},
						},
					},
				},
			},
		},
		{
			name: "Should show value serializer types for CloudEventsConverter and proper schemas enabled value",
			args: args{
				response: model.ValidationResponse{
					Configs: []model.ConfigDefinition{
						{
							Value: model.ConfigDefinitionValue{
								Name:  "key.converter",
								Value: "io.confluent.connect.avro.AvroConverter",
							},
							Definition: model.ConfigDefinitionKey{
								Importance: model.ConfigDefinitionImportanceLow,
							},
						},
						{
							Value: model.ConfigDefinitionValue{
								Name:  "value.converter",
								Value: "io.debezium.converters.CloudEventsConverter",
							},
							Definition: model.ConfigDefinitionKey{
								Importance: model.ConfigDefinitionImportanceLow,
							},
						},
					},
				},
				config: map[string]any{
					"value.converter.data.serializer.type": "json",
					"value.converter.json.schemas.enable":  "false",
				},
			},

			want: model.ValidationResponse{
				Configs: []model.ConfigDefinition{
					{
						Value: model.ConfigDefinitionValue{
							Name:  "key.converter",
							Value: "io.confluent.connect.avro.AvroConverter",
						},
						Definition: model.ConfigDefinitionKey{
							Importance: model.ConfigDefinitionImportanceLow,
						},
					},
					{
						Value: model.ConfigDefinitionValue{
							Name:  "value.converter",
							Value: "io.debezium.converters.CloudEventsConverter",
						},
						Definition: model.ConfigDefinitionKey{
							Importance: model.ConfigDefinitionImportanceLow,
						},
					},
					{
						Definition: model.ConfigDefinitionKey{
							Name:          "key.converter.serializer.type",
							Type:          "STRING",
							DefaultValue:  "json",
							Importance:    model.ConfigDefinitionImportanceLow,
							Required:      false,
							DisplayName:   "Message key serializer type",
							Documentation: "The encoding type to use for the CloudEvents envelope structure",
						},
						Value: model.ConfigDefinitionValue{
							Name:              "key.converter.serializer.type",
							Value:             "json",
							RecommendedValues: []string{},
							Visible:           false,
							Errors:            []string{},
						},
						Metadata: model.ConfigDefinitionMetadata{
							ComponentType: model.ComponentRadioGroup,
							RecommendedValues: []model.RecommendedValueWithMetadata{
								{Value: "avro", DisplayName: "AVRO"},
								{Value: "json", DisplayName: "JSON"},
							},
						},
					},
					{
						Definition: model.ConfigDefinitionKey{
							Name:          "key.converter.data.serializer.type",
							Type:          "STRING",
							DefaultValue:  "json",
							Importance:    model.ConfigDefinitionImportanceLow,
							Required:      false,
							DisplayName:   "Message key data serializer type",
							Documentation: "The encoding type to use for the data attribute",
						},
						Value: model.ConfigDefinitionValue{
							Name:              "key.converter.data.serializer.type",
							Value:             "json",
							RecommendedValues: []string{},
							Visible:           false,
							Errors:            []string{},
						},
						Metadata: model.ConfigDefinitionMetadata{
							ComponentType: model.ComponentRadioGroup,
							RecommendedValues: []model.RecommendedValueWithMetadata{
								{Value: "avro", DisplayName: "AVRO"},
								{Value: "json", DisplayName: "JSON"},
							},
						},
					},
					{
						Definition: model.ConfigDefinitionKey{
							Name:          "key.converter.json.schemas.enable",
							Type:          "BOOLEAN",
							DefaultValue:  "true",
							Importance:    model.ConfigDefinitionImportanceLow,
							Required:      false,
							DisplayName:   "Message key CloudEvents JSON contains schema",
							Documentation: "Whether your message key contains schema in the schema field",
						},
						Value: model.ConfigDefinitionValue{
							Name:              "key.converter.json.schemas.enable",
							Value:             "true",
							RecommendedValues: []string{"true", "false"},
							Visible:           false,
							Errors:            []string{},
						},
					},
					{
						Definition: model.ConfigDefinitionKey{
							Name:          "value.converter.serializer.type",
							Type:          "STRING",
							DefaultValue:  "json",
							Importance:    model.ConfigDefinitionImportanceLow,
							Required:      false,
							DisplayName:   "Message value serializer type",
							Documentation: "The encoding type to use for the CloudEvents envelope structure",
						},
						Value: model.ConfigDefinitionValue{
							Name:              "value.converter.serializer.type",
							Value:             "json",
							RecommendedValues: []string{},
							Visible:           true,
							Errors:            []string{},
						},
						Metadata: model.ConfigDefinitionMetadata{
							ComponentType: model.ComponentRadioGroup,
							RecommendedValues: []model.RecommendedValueWithMetadata{
								{Value: "avro", DisplayName: "AVRO"},
								{Value: "json", DisplayName: "JSON"},
							},
						},
					},
					{
						Definition: model.ConfigDefinitionKey{
							Name:          "value.converter.data.serializer.type",
							Type:          "STRING",
							DefaultValue:  "json",
							Importance:    model.ConfigDefinitionImportanceLow,
							Required:      false,
							DisplayName:   "Message value data serializer type",
							Documentation: "The encoding type to use for the data attribute",
						},
						Value: model.ConfigDefinitionValue{
							Name:              "value.converter.data.serializer.type",
							Value:             "json",
							RecommendedValues: []string{},
							Visible:           true,
							Errors:            []string{},
						},
						Metadata: model.ConfigDefinitionMetadata{
							ComponentType: model.ComponentRadioGroup,
							RecommendedValues: []model.RecommendedValueWithMetadata{
								{Value: "avro", DisplayName: "AVRO"},
								{Value: "json", DisplayName: "JSON"},
							},
						},
					},
					{
						Definition: model.ConfigDefinitionKey{
							Name:          "value.converter.json.schemas.enable",
							Type:          "BOOLEAN",
							DefaultValue:  "true",
							Importance:    model.ConfigDefinitionImportanceLow,
							Required:      false,
							DisplayName:   "Message value CloudEvents JSON contains schema",
							Documentation: "Whether your message value contains schema in the schema field",
						},
						Value: model.ConfigDefinitionValue{
							Name:              "value.converter.json.schemas.enable",
							Value:             "false",
							RecommendedValues: []string{"true", "false"},
							Visible:           true,
							Errors:            []string{},
						},
					},
				},
			},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := KafkaConnectToConsoleCloudEventsConverterHook(tt.args.response, tt.args.config); !reflect.DeepEqual(got, tt.want) {
				t.Errorf("KafkaConnectToConsoleCloudEventsConverterHook() = %v, want %v", got, tt.want)
			}
		})
	}
}
