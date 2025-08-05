// Copyright 2024 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

//go:build integration

package integration

import (
	"context"
	"net/http"
	"testing"
	"time"

	"connectrpc.com/connect"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	consolev1alpha1 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/console/v1alpha1"
	"github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/console/v1alpha1/consolev1alpha1connect"
)

func (s *APISuite) TestListLicenses() {
	t := s.T()

	// Seed some topics that can be listed
	ctx, cancel := context.WithTimeout(context.Background(), 9*time.Second)
	t.Cleanup(cancel)

	connectClient := consolev1alpha1connect.NewLicenseServiceClient(http.DefaultClient, s.httpAddress())

	t.Run("list all licenses (connect-go)", func(t *testing.T) {
		require := require.New(t)
		assert := assert.New(t)
		ctx, cancel := context.WithTimeout(ctx, 3*time.Second)
		t.Cleanup(cancel)

		licensesRes, err := connectClient.ListLicenses(ctx, connect.NewRequest(&consolev1alpha1.ListLicensesRequest{}))
		require.NoError(err)

		licenses := licensesRes.Msg.GetLicenses()
		assert.Len(licenses, 2, "should have exactly 2 licenses")

		// Count license types
		trialCount := 0
		communityCount := 0
		for _, l := range licenses {
			switch l.Type {
			case consolev1alpha1.License_TYPE_TRIAL:
				trialCount++
			case consolev1alpha1.License_TYPE_COMMUNITY:
				communityCount++
			default:
				t.Errorf("unexpected license type: %v", l.Type)
			}
		}

		// Verify we have exactly one of each type
		assert.Equal(1, trialCount, "should have exactly one trial license")
		assert.Equal(1, communityCount, "should have exactly one community license")
	})
}
