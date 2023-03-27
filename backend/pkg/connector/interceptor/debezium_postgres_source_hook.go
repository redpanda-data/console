package interceptor

import "github.com/redpanda-data/console/backend/pkg/connector/model"

func KafkaConnectToConsoleDebeziumPostgresSourceHook(response model.ValidationResponse, config map[string]any) model.ValidationResponse {
	response.Configs = append(response.Configs, model.ConfigDefinition{
		Definition: model.ConfigDefinitionKey{
			Name:          "money.fraction.digits",
			Type:          "SHORT",
			DefaultValue:  "2",
			Importance:    model.ConfigDefinitionImportanceMedium,
			Required:      false,
			DisplayName:   "Money fraction digits",
			Documentation: "Number of fractional digits when money type is converted to 'precise' decimal number.",
			Dependents:    []string{},
		},
		Value: model.ConfigDefinitionValue{
			Name:              "money.fraction.digits",
			Value:             "2",
			RecommendedValues: []string{},
			Visible:           true,
			Errors:            []string{},
		},
	})

	response.Configs = append(response.Configs, model.ConfigDefinition{
		Definition: model.ConfigDefinitionKey{
			Name:          "topic.creation.enable",
			Type:          "BOOLEAN",
			DefaultValue:  "true",
			Importance:    model.ConfigDefinitionImportanceLow,
			Required:      false,
			DisplayName:   "Topic creation enabled",
			Documentation: "Whether to allow automatic creation of topics. Enabled by default.",
			Dependents:    []string{},
		},
		Value: model.ConfigDefinitionValue{
			Name:              "topic.creation.enable",
			Value:             "true",
			RecommendedValues: []string{},
			Visible:           true,
			Errors:            []string{},
		},
	})

	response.Configs = append(response.Configs, model.ConfigDefinition{
		Definition: model.ConfigDefinitionKey{
			Name:          "topic.creation.default.partitions",
			Type:          "LONG",
			DefaultValue:  "-1",
			Importance:    model.ConfigDefinitionImportanceLow,
			Required:      false,
			DisplayName:   "Topic creation partitions",
			Documentation: "Number of partitions for the created topics.",
			Dependents:    []string{},
		},
		Value: model.ConfigDefinitionValue{
			Name:              "topic.creation.default.partitions",
			Value:             "-1",
			RecommendedValues: []string{},
			Visible:           true,
			Errors:            []string{},
		},
	})

	response.Configs = append(response.Configs, model.ConfigDefinition{
		Definition: model.ConfigDefinitionKey{
			Name:          "topic.creation.default.replication.factor",
			Type:          "LONG",
			DefaultValue:  "-1",
			Importance:    model.ConfigDefinitionImportanceLow,
			Required:      false,
			DisplayName:   "Topic creation replication factor",
			Documentation: "Replication factor for the created topics.",
			Dependents:    []string{},
		},
		Value: model.ConfigDefinitionValue{
			Name:              "topic.creation.default.replication.factor",
			Value:             "-1",
			RecommendedValues: []string{},
			Visible:           true,
			Errors:            []string{},
		},
	})

	return response
}
