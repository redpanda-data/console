package interceptor

import (
	"github.com/redpanda-data/console/backend/pkg/connector/model"
	"github.com/redpanda-data/console/backend/pkg/connector/patch"
)

// KafkaConnectValidateToConsoleIcebergSinkHook adds Iceberg sink specific config options
// missing in Validate Kafka Connect response
func KafkaConnectValidateToConsoleIcebergSinkHook(response model.ValidationResponse, config map[string]any) model.ValidationResponse {
	response.Configs = append(response.Configs,
		model.ConfigDefinition{
			Definition: model.ConfigDefinitionKey{
				Name:          "iceberg.catalog.type",
				Type:          "STRING",
				DefaultValue:  "",
				Importance:    model.ConfigDefinitionImportanceHigh,
				Required:      false,
				DisplayName:   "Iceberg catalog type",
				Documentation: "To set the catalog type. For other catalog types, you need to instead set 'iceberg.catalog.catalog-impl' to the name of the catalog class",
				Dependents:    []string{},
			},
			Value: model.ConfigDefinitionValue{
				Name:              "iceberg.catalog.type",
				Value:             "rest",
				RecommendedValues: []string{},
				Visible:           true,
				Errors:            []string{},
			},
			Metadata: model.ConfigDefinitionMetadata{
				ComponentType: model.ComponentRadioGroup,
				RecommendedValues: []model.RecommendedValueWithMetadata{
					{Value: "rest", DisplayName: "REST"},
					{Value: "hive", DisplayName: "HIVE"},
					{Value: "hadoop", DisplayName: "HADOOP"},
				},
			},
		},
		model.ConfigDefinition{
			Definition: model.ConfigDefinitionKey{
				Name:          "iceberg.catalog.uri",
				Type:          "STRING",
				DefaultValue:  "",
				Importance:    model.ConfigDefinitionImportanceHigh,
				Required:      false,
				DisplayName:   "Iceberg REST catalog URI",
				Documentation: "Use for Iceberg REST catalog type. Use JSON configuration for other catalog types",
				Dependents:    []string{},
			},
			Value: model.ConfigDefinitionValue{
				Name:              "iceberg.catalog.uri",
				Value:             "",
				RecommendedValues: []string{},
				Visible:           isRestCatalogType(response.Configs),
				Errors:            []string{},
			},
		},
		model.ConfigDefinition{
			Definition: model.ConfigDefinitionKey{
				Name:          "iceberg.catalog.s3.secret-access-key",
				Type:          "PASSWORD",
				DefaultValue:  "",
				Importance:    model.ConfigDefinitionImportanceHigh,
				Required:      false,
				DisplayName:   "Iceberg REST catalog S3 Secret Access Key",
				Documentation: "Use for Iceberg REST catalog type. Use JSON configuration for other catalog types",
				Dependents:    []string{},
			},
			Value: model.ConfigDefinitionValue{
				Name:              "iceberg.catalog.s3.secret-access-key",
				Value:             "",
				RecommendedValues: []string{},
				Visible:           isRestCatalogType(response.Configs),
				Errors:            []string{},
			},
		},
		model.ConfigDefinition{
			Definition: model.ConfigDefinitionKey{
				Name:          "iceberg.catalog.s3.access-key-id",
				Type:          "PASSWORD",
				DefaultValue:  "",
				Importance:    model.ConfigDefinitionImportanceHigh,
				Required:      false,
				DisplayName:   "Iceberg REST catalog S3 Access Key ID",
				Documentation: "Use for Iceberg REST catalog type. Use JSON configuration for other catalog types",
				Dependents:    []string{},
			},
			Value: model.ConfigDefinitionValue{
				Name:              "iceberg.catalog.s3.access-key-id",
				Value:             "",
				RecommendedValues: []string{},
				Visible:           isRestCatalogType(response.Configs),
				Errors:            []string{},
			},
		},
		model.ConfigDefinition{
			Definition: model.ConfigDefinitionKey{
				Name:          "iceberg.catalog.s3.endpoint",
				Type:          "STRING",
				DefaultValue:  "",
				Importance:    model.ConfigDefinitionImportanceMedium,
				Required:      false,
				DisplayName:   "Iceberg REST catalog S3 endpoint",
				Documentation: "Use for Iceberg REST catalog type. Use JSON configuration for other catalog types",
				Dependents:    []string{},
			},
			Value: model.ConfigDefinitionValue{
				Name:              "iceberg.catalog.s3.endpoint",
				Value:             "",
				RecommendedValues: []string{},
				Visible:           isRestCatalogType(response.Configs),
				Errors:            []string{},
			},
		},
		model.ConfigDefinition{
			Definition: model.ConfigDefinitionKey{
				Name:          "iceberg.catalog.s3.path-style-access",
				Type:          "BOOLEAN",
				DefaultValue:  "",
				Importance:    model.ConfigDefinitionImportanceHigh,
				Required:      false,
				DisplayName:   "Iceberg REST catalog S3 path style access",
				Documentation: "Use for Iceberg REST catalog type. Use JSON configuration for other catalog types",
				Dependents:    []string{},
			},
			Value: model.ConfigDefinitionValue{
				Name:              "iceberg.catalog.s3.path-style-access",
				Value:             "",
				RecommendedValues: []string{},
				Visible:           true,
				Errors:            []string{},
			},
		},
		model.ConfigDefinition{
			Definition: model.ConfigDefinitionKey{
				Name:          "iceberg.catalog.client.region",
				Type:          "STRING",
				DefaultValue:  "",
				Importance:    model.ConfigDefinitionImportanceHigh,
				Required:      false,
				DisplayName:   "Iceberg REST catalog client region",
				Documentation: "Use for Iceberg REST catalog type. Use JSON configuration for other catalog types",
				Dependents:    []string{},
			},
			Value: model.ConfigDefinitionValue{
				Name:              "iceberg.catalog.client.region",
				Value:             "us-east-1",
				RecommendedValues: patch.AwsRegions,
				Visible:           true,
				Errors:            []string{},
			},
		},
		model.ConfigDefinition{
			Definition: model.ConfigDefinitionKey{
				Name:          "iceberg.catalog.credential",
				Type:          "STRING",
				DefaultValue:  "",
				Importance:    model.ConfigDefinitionImportanceHigh,
				Required:      false,
				DisplayName:   "Iceberg catalog credential",
				Documentation: "Iceberg catalog credential",
				Dependents:    []string{},
			},
			Value: model.ConfigDefinitionValue{
				Name:              "iceberg.catalog.credential",
				Value:             "",
				RecommendedValues: []string{},
				Visible:           true,
				Errors:            []string{},
			},
		},
		model.ConfigDefinition{
			Definition: model.ConfigDefinitionKey{
				Name:         "iceberg.catalog.warehouse",
				Type:         "STRING",
				DefaultValue: "",
				Importance:   model.ConfigDefinitionImportanceHigh,
				Required:     false,
				DisplayName:  "Iceberg catalog warehouse",
				Dependents:   []string{},
			},
			Value: model.ConfigDefinitionValue{
				Name:              "iceberg.catalog.warehouse",
				Value:             "",
				RecommendedValues: []string{},
				Visible:           true,
				Errors:            []string{},
			},
		},
	)

	return KafkaConnectToConsoleJSONSchemaHook(response, config)
}

func isRestCatalogType(configs []model.ConfigDefinition) bool {
	for _, config := range configs {
		if config.Value.Name == "iceberg.catalog.type" {
			return config.Value.Value == "rest"
		}
	}
	return true
}
