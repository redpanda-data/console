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
	"path"

	con "github.com/cloudhut/connect-client"
	"golang.org/x/exp/slices"
)

// OverrideService helps with modifying the /validate connector response based on the
// provided connector-specific overrides / guides. The /validate connector response
// is used by the Frontend to render forms for creating new Kafka connect instances.
// At a high level it does so by
// merging the overrides into the response or by removing some objects from the
// validate response if the config key matches one of the to be removed keys.
type OverrideService struct {
	ConnectorGuides map[string] /* connector class */ ConnectorGuide
}

func newOverrideService() (*OverrideService, error) {
	dirEntry, err := connectorGuides.ReadDir("guides")
	if err != nil {
		return nil, fmt.Errorf("failed to read embedded dir: %w", err)
	}

	guidesByClassName := make(map[string]ConnectorGuide)
	for _, entry := range dirEntry {
		fileContents, err := connectorGuides.ReadFile(path.Join("guides", entry.Name()))
		if err != nil {
			return nil, fmt.Errorf("failed to read file %q: %w", entry.Name(), err)
		}

		cg, err := newConnectorGuide(fileContents)
		if err != nil {
			return nil, fmt.Errorf("failed to create connector guide for entry %q: %w", entry.Name(), err)
		}
		guidesByClassName[cg.ConnectorClass] = cg
	}

	return &OverrideService{ConnectorGuides: guidesByClassName}, nil
}

func (s *OverrideService) OverrideResults(validationResult con.ConnectorValidationResult, sentValues map[string]interface{}) con.ConnectorValidationResult {
	guide, exists := s.ConnectorGuides[validationResult.Name]
	if !exists {
		return validationResult
	}

	configs := make([]con.ConnectorValidationResultConfig, 0, len(validationResult.Configs))
	for _, config := range validationResult.Configs {
		configName, exists := config.Definition["name"]
		if !exists {
			continue
		}

		configNameStr, ok := configName.(string)
		if !ok {
			configs = append(configs, config)
			continue
		}

		if guide.MatchesConfigRemoval(configNameStr) {
			continue
		}

		// Merge override definitions & value maps into given result
		configOverride := guide.GetConfigOverride(configNameStr)
		if configOverride != nil {
			for key, value := range configOverride.Definition {
				config.Definition[key] = value
			}
			for key, value := range configOverride.Value {
				config.Value[key] = value
			}
		}
		configs = append(configs, config)
	}

	// Inject additional config blocks if they exist (we inject additional config options for MM2)
	for _, def := range guide.AdditionalConfigDefinitions {
		currentValue := sentValues[def.Name]
		config := def.ToKafkaConnectCompatible(currentValue)
		configs = append(configs, config)

		if !slices.Contains(validationResult.Groups, *def.Group) {
			validationResult.Groups = append(validationResult.Groups, *def.Group)
		}
	}

	validationResult.Configs = configs

	return validationResult
}
