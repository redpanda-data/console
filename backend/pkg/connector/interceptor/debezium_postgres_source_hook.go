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

	return KafkaConnectToConsoleTopicCreationHook(KafkaConnectToConsoleJsonSchemaHook(response, config), config)
}
