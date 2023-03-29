package interceptor

import "github.com/redpanda-data/console/backend/pkg/connector/model"

func KafkaConnectToConsoleHttpSourceHook(response model.ValidationResponse, config map[string]any) model.ValidationResponse {
	response.Configs = append(response.Configs, model.ConfigDefinition{
		Definition: model.ConfigDefinitionKey{
			Name:          "kafka.topic",
			Type:          "STRING",
			DefaultValue:  "",
			Importance:    model.ConfigDefinitionImportanceHigh,
			Required:      true,
			DisplayName:   "Topic",
			Documentation: "Name of the topic where the record will be sent to.",
			Dependents:    []string{},
		},
		Value: model.ConfigDefinitionValue{
			Name:              "kafka.topic",
			Value:             "",
			RecommendedValues: []string{},
			Visible:           true,
			Errors:            []string{},
		},
	})

	response.Configs = append(response.Configs, model.ConfigDefinition{
		Definition: model.ConfigDefinitionKey{
			Name:          "http.request.url",
			Type:          "STRING",
			DefaultValue:  "",
			Importance:    model.ConfigDefinitionImportanceHigh,
			Required:      true,
			DisplayName:   "HTTP URL",
			Documentation: "HTTP URL to use in the request.",
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
			Documentation: "Http headers to use in the request, comma separated list of : separated pairs. Example: 'Name:Value,Name2:Value2'",
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
			RecommendedValues: []string{"GET", "POST", "PUT", "HEAD", "DELETE", "PATCH"},
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
			DisplayName:   "HTTP Authentication type",
			Documentation: "Type of authentication.",
			Dependents:    []string{},
		},
		Value: model.ConfigDefinitionValue{
			Name:              "http.auth.type",
			Value:             "None",
			RecommendedValues: []string{"None", "Basic"},
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
			DisplayName:   "HTTP user",
			Documentation: "Basic authentication user.",
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
			Type:          "PASSWORD",
			DefaultValue:  "",
			Importance:    model.ConfigDefinitionImportanceHigh,
			Required:      false,
			DisplayName:   "HTTP password",
			Documentation: "Basic authentication password.",
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

	response.Configs = append(response.Configs, model.ConfigDefinition{
		Definition: model.ConfigDefinitionKey{
			Name:          "http.response.list.pointer",
			Type:          "STRING",
			DefaultValue:  "/",
			Importance:    model.ConfigDefinitionImportanceMedium,
			Required:      false,
			DisplayName:   "HTTP response list pointer",
			Documentation: "JsonPointer to the property in the response body containing an array of records. Example: '/items'",
			Dependents:    []string{},
		},
		Value: model.ConfigDefinitionValue{
			Name:              "http.response.list.pointer",
			Value:             "/",
			RecommendedValues: []string{},
			Visible:           true,
			Errors:            []string{},
		},
	})

	response.Configs = append(response.Configs, model.ConfigDefinition{
		Definition: model.ConfigDefinitionKey{
			Name:          "http.response.record.offset.pointer",
			Type:          "STRING",
			DefaultValue:  "",
			Importance:    model.ConfigDefinitionImportanceMedium,
			Required:      false,
			DisplayName:   "HTTP response record offset pointer",
			Documentation: "Comma separated list of key=/value pairs where the key is the name of the property in the offset, and the value is the JsonPointer to the value being used as offset for future requests.",
			Dependents:    []string{},
		},
		Value: model.ConfigDefinitionValue{
			Name:              "http.response.record.offset.pointer",
			Value:             "",
			RecommendedValues: []string{},
			Visible:           true,
			Errors:            []string{},
		},
	})

	response.Configs = append(response.Configs, model.ConfigDefinition{
		Definition: model.ConfigDefinitionKey{
			Name:          "http.timer.interval.millis",
			Type:          "LONG",
			DefaultValue:  "60000",
			Importance:    model.ConfigDefinitionImportanceMedium,
			Required:      false,
			DisplayName:   "HTTP timer interval in millis",
			Documentation: "Interval in between requests when up-to-date (milliseconds)",
			Dependents:    []string{},
		},
		Value: model.ConfigDefinitionValue{
			Name:              "http.timer.interval.millis",
			Value:             "60000",
			RecommendedValues: []string{},
			Visible:           true,
			Errors:            []string{},
		},
	})

	response.Configs = append(response.Configs, model.ConfigDefinition{
		Definition: model.ConfigDefinitionKey{
			Name:          "http.timer.catchup.interval.millis",
			Type:          "LONG",
			DefaultValue:  "60000",
			Importance:    model.ConfigDefinitionImportanceMedium,
			Required:      false,
			DisplayName:   "HTTP timer catchup interval in millis",
			Documentation: "Interval in between requests when catching up (milliseconds)",
			Dependents:    []string{},
		},
		Value: model.ConfigDefinitionValue{
			Name:              "http.timer.catchup.interval.millis",
			Value:             "30000",
			RecommendedValues: []string{},
			Visible:           true,
			Errors:            []string{},
		},
	})

	response.Configs = append(response.Configs, model.ConfigDefinition{
		Definition: model.ConfigDefinitionKey{
			Name:          "http.client.connection.timeout.millis",
			Type:          "LONG",
			DefaultValue:  "2000",
			Importance:    model.ConfigDefinitionImportanceMedium,
			Required:      false,
			DisplayName:   "HTTP client connection timeout in millis",
			Documentation: "Timeout for opening a connection (milliseconds)",
			Dependents:    []string{},
		},
		Value: model.ConfigDefinitionValue{
			Name:              "http.client.connection.timeout.millis",
			Value:             "2000",
			RecommendedValues: []string{},
			Visible:           true,
			Errors:            []string{},
		},
	})

	response.Configs = append(response.Configs, model.ConfigDefinition{
		Definition: model.ConfigDefinitionKey{
			Name:          "http.client.read.timeout.millis",
			Type:          "LONG",
			DefaultValue:  "2000",
			Importance:    model.ConfigDefinitionImportanceMedium,
			Required:      false,
			DisplayName:   "Read timeout in millis",
			Documentation: "Timeout for reading a response (milliseconds)",
			Dependents:    []string{},
		},
		Value: model.ConfigDefinitionValue{
			Name:              "http.client.read.timeout.millis",
			Value:             "2000",
			RecommendedValues: []string{},
			Visible:           true,
			Errors:            []string{},
		},
	})

	response.Configs = append(response.Configs, model.ConfigDefinition{
		Definition: model.ConfigDefinitionKey{
			Name:          "http.client.connection.ttl.millis",
			Type:          "LONG",
			DefaultValue:  "300000",
			Importance:    model.ConfigDefinitionImportanceMedium,
			Required:      false,
			DisplayName:   "Time to live for the connection in millis",
			Documentation: "",
			Dependents:    []string{},
		},
		Value: model.ConfigDefinitionValue{
			Name:              "http.client.connection.ttl.millis",
			Value:             "300000",
			RecommendedValues: []string{},
			Visible:           true,
			Errors:            []string{},
		},
	})

	response.Configs = append(response.Configs, model.ConfigDefinition{
		Definition: model.ConfigDefinitionKey{
			Name:          "http.response.policy.codes.skip",
			Type:          "STRING",
			DefaultValue:  "300..399",
			Importance:    model.ConfigDefinitionImportanceMedium,
			Required:      false,
			DisplayName:   "Skip HTTP response codes policy",
			Documentation: "Comma separated list of code ranges that will result in the parser skipping the response. Example: '300..305, 307..310'",
			Dependents:    []string{},
		},
		Value: model.ConfigDefinitionValue{
			Name:              "http.response.policy.codes.skip",
			Value:             "300..399",
			RecommendedValues: []string{},
			Visible:           true,
			Errors:            []string{},
		},
	})

	return KafkaConnectToConsoleTopicCreationHook(response, config)
}
