package interceptor

import (
	"net/url"
	"regexp"
	"strings"

	"github.com/redpanda-data/console/backend/pkg/connector/model"
)

const (
	passwordPlaceholder = "__PASSWORD_PLACEHOLDER"
)

var (
	configProviderRegex           = regexp.MustCompile(`\${.+:.*:.+}`)
	hasKafkaConnectConfigProvider = configProviderRegex.MatchString
)

// ConsoleToKafkaConnectMongoDBHook sets connection authentication and output format properties
func ConsoleToKafkaConnectMongoDBHook(config map[string]any) map[string]any {
	_, exists := config["connection.uri"]
	if !exists {
		config["connection.uri"] = "mongodb://"
	}

	if config["connection.username"] != nil && config["connection.password"] != nil && config["connection.url"] != nil {
		password := config["connection.password"].(string)
		if hasKafkaConnectConfigProvider(config["connection.password"].(string)) {
			password = passwordPlaceholder
		}
		if hasKafkaConnectConfigProvider(config["connection.url"].(string)) {
			config["connection.url"] = configProviderRegex.ReplaceAllString(config["connection.url"].(string), passwordPlaceholder)
		}

		u, e := url.Parse(config["connection.url"].(string))
		if e == nil {
			u.User = nil
			config["connection.url"] = u.String()
			u.User = url.UserPassword(config["connection.username"].(string), password)
			config["connection.uri"] = u.String()

			if hasKafkaConnectConfigProvider(config["connection.password"].(string)) {
				config["connection.uri"] = strings.ReplaceAll(config["connection.uri"].(string), passwordPlaceholder, config["connection.password"].(string))
			}
		}
	}

	for _, field := range []string{"key", "value"} {
		if config["output.format."+field] == nil {
			switch config[field+".converter"] {
			case "org.apache.kafka.connect.json.JsonConverter",
				"io.confluent.connect.avro.AvroConverter":
				config["output.format."+field] = "schema"
			case "org.apache.kafka.connect.storage.StringConverter":
				config["output.format."+field] = "json"
			case "org.apache.kafka.connect.converters.ByteArrayConverter":
				config["output.format."+field] = "bson"
			}
		}
	}

	return config
}

// KafkaConnectToConsoleMongoDBHook adds connection fields: URL, username and password
func KafkaConnectToConsoleMongoDBHook(response model.ValidationResponse, _ map[string]any) model.ValidationResponse {
	response.Configs = append(response.Configs,
		model.ConfigDefinition{
			Definition: model.ConfigDefinitionKey{
				Name:          "connection.url",
				Type:          "STRING",
				DefaultValue:  "",
				Importance:    "HIGH",
				Required:      true,
				DisplayName:   "MongoDB Connection URI",
				Documentation: "The connection URI as supported by the official drivers. eg: mongodb://locahost/.",
			},
			Value: model.ConfigDefinitionValue{
				Name:              "connection.url",
				Value:             "",
				RecommendedValues: []string{},
				Visible:           true,
				Errors:            []string{},
			},
		},
		model.ConfigDefinition{
			Definition: model.ConfigDefinitionKey{
				Name:         "connection.username",
				Type:         "STRING",
				DefaultValue: "",
				Importance:   "HIGH",
				Required:     false,
				DisplayName:  "MongoDB username",
			},
			Value: model.ConfigDefinitionValue{
				Name:              "connection.username",
				Value:             "",
				RecommendedValues: []string{},
				Visible:           true,
				Errors:            []string{},
			},
		},
		model.ConfigDefinition{
			Definition: model.ConfigDefinitionKey{
				Name:         "connection.password",
				Type:         "PASSWORD",
				DefaultValue: "",
				Importance:   "HIGH",
				Required:     false,
				DisplayName:  "MongoDB password",
			},
			Value: model.ConfigDefinitionValue{
				Name:              "connection.password",
				Value:             "",
				RecommendedValues: []string{},
				Visible:           true,
				Errors:            []string{},
			},
		},
	)

	return response
}
