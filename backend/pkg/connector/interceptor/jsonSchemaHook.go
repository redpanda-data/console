package interceptor

import "github.com/redpanda-data/console/backend/pkg/connector/model"

func KafkaConnectToConsoleJsonSchemaHook(response model.ValidationResponse) model.ValidationResponse {
	for _, prefix := range []string{"key", "value", "header"} {
		schemaSelectorVisible := false
		importance := model.ConfigDefinitionImportanceLow
		for _, config := range response.Configs {
			if config.Value.Name == prefix+".converter" {
				schemaSelectorVisible = config.Value.Value == "org.apache.kafka.connect.json.JsonConverter"
				importance = config.Definition.Importance
			}
		}

		response.Configs = append(response.Configs, model.ConfigDefinition{
			Definition: model.ConfigDefinitionKey{
				Name:          prefix + ".converter.schemas.enable",
				Type:          "BOOLEAN",
				DefaultValue:  "true",
				Importance:    importance,
				Required:      false,
				DisplayName:   prefix + " JSON contain schema",
				Documentation: "Whether your message " + prefix + " contains schema in the schema field",
			},
			Value: model.ConfigDefinitionValue{
				Name:              prefix + ".converter.schemas.enable",
				Value:             "true",
				RecommendedValues: []string{"true", "false"},
				Visible:           schemaSelectorVisible,
				Errors:            []string{},
			},
		})
	}

	return response
}
