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
	_ "embed"
	"encoding/json"
	"testing"

	"github.com/cloudhut/connect-client"
	"github.com/stretchr/testify/suite"
)

var (
	//go:embed guides_test/mm2_source_connector.json
	mm2SourceConnector []byte
	//go:embed guides_test/mm2_source_connector_result.json
	mm2SourceConnectorResult []byte
)

// OverrideServiceTestSuite sets up the override service and tests all relevant methods
// on it.
type OverrideServiceTestSuite struct {
	suite.Suite
	overrideSvc *OverrideService
}

// Make sure that VariableThatShouldStartAtFive is set to five
// before each test
func (s *OverrideServiceTestSuite) SetupTest() {
	require := s.Require()

	overrideSvc, err := newOverrideService()
	require.NoError(err)

	s.overrideSvc = overrideSvc
}

func (s *OverrideServiceTestSuite) TestOverrideResults() {
	require := s.Require()
	assert := s.Assert()

	// Original validation response as given by a potential Connect cluster
	var validationResult connect.ConnectorValidationResult
	err := json.Unmarshal(mm2SourceConnector, &validationResult)
	require.NoError(err)

	// Parse expected/desired output as defined in the guides_test dir
	var expectedValidationResult connect.ConnectorValidationResult
	err = json.Unmarshal(mm2SourceConnectorResult, &expectedValidationResult)
	require.NoError(err)

	overrideResult := s.overrideSvc.OverrideResults(validationResult)
	assert.Equal(expectedValidationResult, overrideResult)
}

func TestOverrideServiceSuite(t *testing.T) {
	s := OverrideServiceTestSuite{}
	suite.Run(t, &s)
}
