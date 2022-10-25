// Copyright 2022 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package connect

import (
	"fmt"
	"strings"

	"github.com/redpanda-data/console/backend/pkg/validator"
)

var (
	defaultValidator = func(cd *ConfigDefinition, value interface{}) []string {
		errors := make([]string, 0)
		hasValue := cd.DefaultValue != "" || value != nil
		if cd.Required && !hasValue {
			errors = append(errors, fmt.Sprintf("Missing required configuration \"%v\" which has no default value.", cd.Name))
		}
		return errors
	}

	hostnamesValidator = func(cd *ConfigDefinition, value interface{}) []string {
		errors := defaultValidator(cd, value)
		if len(errors) > 0 {
			return errors
		}

		valueStr, ok := value.(string)
		if !ok {
			errors = append(errors, fmt.Sprintf("Configuration \"%v\" must be a string.", cd.Name))
			return errors
		}

		splitHosts := strings.Split(valueStr, ",")
		for _, host := range splitHosts {
			isValid, err := validator.IsHostnamePort(host)
			if !isValid {
				errors = append(errors, fmt.Sprintf("Hostname \"%v\" is invalid: %v", host, err.Error()))
			}
		}

		return errors
	}
)
