package interceptor

import "github.com/redpanda-data/console/backend/pkg/connector/model"

func KafkaConnectToConsoleHttpSourceHook(response model.ValidationResponse, config map[string]any) model.ValidationResponse {
	response.Configs = append(response.Configs, model.ConfigDefinition{
		Definition: model.ConfigDefinitionKey{
			Name:          "http.request.url",
			Type:          "STRING",
			DefaultValue:  "",
			Importance:    model.ConfigDefinitionImportanceHigh,
			Required:      true,
			DisplayName:   "HTTP URL",
			Documentation: "HTTP URL url to use in the request.",
			Dependents:    []string{},
		},
		Value: model.ConfigDefinitionValue{
			Name:              "http.request.url",
			Value:             "",
			RecommendedValues: []string{},
			Visible:           true,
			Errors:            []string{},
		},
	})

	response.Configs = append(response.Configs, model.ConfigDefinition{
		Definition: model.ConfigDefinitionKey{
			Name:          "http.request.headers",
			Type:          "STRING",
			DefaultValue:  "",
			Importance:    model.ConfigDefinitionImportanceMedium,
			Required:      false,
			DisplayName:   "HTTP request headers",
			Documentation: "Http headers to use in the request. , separated list of : separated pairs. Example: 'Name:Value,Name2:Value2'",
			Dependents:    []string{},
		},
		Value: model.ConfigDefinitionValue{
			Name:              "http.request.headers",
			Value:             "",
			RecommendedValues: []string{},
			Visible:           true,
			Errors:            []string{},
		},
	})

	response.Configs = append(response.Configs, model.ConfigDefinition{
		Definition: model.ConfigDefinitionKey{
			Name:          "http.request.method",
			Type:          "STRING",
			DefaultValue:  "GET",
			Importance:    model.ConfigDefinitionImportanceMedium,
			Required:      false,
			DisplayName:   "HTTP method",
			Documentation: "Http method to use in the request. Default: GET",
			Dependents:    []string{},
		},
		Value: model.ConfigDefinitionValue{
			Name:              "http.request.method",
			Value:             "GET",
			RecommendedValues: []string{},
			Visible:           true,
			Errors:            []string{},
		},
	})

	response.Configs = append(response.Configs, model.ConfigDefinition{
		Definition: model.ConfigDefinitionKey{
			Name:          "http.request.params",
			Type:          "STRING",
			DefaultValue:  "",
			Importance:    model.ConfigDefinitionImportanceMedium,
			Required:      false,
			DisplayName:   "HTTP request params",
			Documentation: "HTTP query parameters to use in the request. & separated list of = separated pairs. Example: 'name=value&name2=value2'",
			Dependents:    []string{},
		},
		Value: model.ConfigDefinitionValue{
			Name:              "http.request.params",
			Value:             "",
			RecommendedValues: []string{},
			Visible:           true,
			Errors:            []string{},
		},
	})

	response.Configs = append(response.Configs, model.ConfigDefinition{
		Definition: model.ConfigDefinitionKey{
			Name:          "http.auth.type",
			Type:          "STRING",
			DefaultValue:  "None",
			Importance:    model.ConfigDefinitionImportanceHigh,
			Required:      false,
			DisplayName:   "Type of authentication",
			Documentation: "",
			Dependents:    []string{},
		},
		Value: model.ConfigDefinitionValue{
			Name:              "http.auth.type",
			Value:             "None",
			RecommendedValues: []string{},
			Visible:           true,
			Errors:            []string{},
		},
	})

	response.Configs = append(response.Configs, model.ConfigDefinition{
		Definition: model.ConfigDefinitionKey{
			Name:          "http.auth.user",
			Type:          "STRING",
			DefaultValue:  "",
			Importance:    model.ConfigDefinitionImportanceHigh,
			Required:      false,
			DisplayName:   "User for Basic authentication type",
			Documentation: "",
			Dependents:    []string{},
		},
		Value: model.ConfigDefinitionValue{
			Name:              "http.auth.user",
			Value:             "",
			RecommendedValues: []string{},
			Visible:           true,
			Errors:            []string{},
		},
	})

	response.Configs = append(response.Configs, model.ConfigDefinition{
		Definition: model.ConfigDefinitionKey{
			Name:          "http.auth.password",
			Type:          "STRING",
			DefaultValue:  "",
			Importance:    model.ConfigDefinitionImportanceHigh,
			Required:      false,
			DisplayName:   "Password for Basic authentication type",
			Documentation: "",
			Dependents:    []string{},
		},
		Value: model.ConfigDefinitionValue{
			Name:              "http.auth.password",
			Value:             "",
			RecommendedValues: []string{},
			Visible:           true,
			Errors:            []string{},
		},
	})

	return KafkaConnectToConsoleTopicCreationHook(KafkaConnectToConsoleJsonSchemaHook(response, config), config)
}
