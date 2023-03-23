package interceptor

import "github.com/redpanda-data/console/backend/pkg/connector/model"

func KafkaConnectToConsoleDebeziumPostgresSourceHook(response model.ValidationResponse, config map[string]any) model.ValidationResponse {
	response.Configs = append(response.Configs, model.ConfigDefinition{
		Definition: model.ConfigDefinitionKey{
			Name:          "database.include.list",
			Type:          "STRING",
			DefaultValue:  "",
			Importance:    model.ConfigDefinitionImportanceHigh,
			Required:      false,
			Order:         6,
			Width:         "LONG",
			DisplayName:   "Include Databases",
			Documentation: "The databases for which changes are to be captured",
			Dependents:    []string{},
		},
		Value: model.ConfigDefinitionValue{
			Name:              "database.include.list",
			Value:             "",
			RecommendedValues: []string{},
			Visible:           true,
			Errors:            []string{},
		},
	})
	return response
}
