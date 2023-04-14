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

var isKafkaConnectConfigProvider = regexp.MustCompile(`\${.+:.*:.+}`).MatchString

// ConsoleToKafkaConnectMongoDBHook sets connection authentication and output format properties
func ConsoleToKafkaConnectMongoDBHook(config map[string]any) map[string]any {
	_, exists := config["connection.uri"]
	if !exists {
		config["connection.uri"] = "mongodb://"
	}

	if config["connection.username"] != nil && config["connection.password"] != nil && config["connection.uri"] != nil {
		password := config["connection.password"].(string)
		if isKafkaConnectConfigProvider(config["connection.password"].(string)) {
			password = passwordPlaceholder
		}

		u, e := url.Parse(config["connection.uri"].(string))
		if e == nil {
			u.User = url.UserPassword(config["connection.username"].(string), password)
		}
		config["connection.uri"] = u.String()

		if isKafkaConnectConfigProvider(config["connection.password"].(string)) {
			config["connection.uri"] = strings.ReplaceAll(config["connection.uri"].(string), passwordPlaceholder, config["connection.password"].(string))
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

// KafkaConnectToConsoleMongoDBHook adds username and password fields
func KafkaConnectToConsoleMongoDBHook(response model.ValidationResponse, _ map[string]any) model.ValidationResponse {
	response.Configs = append(response.Configs,
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
