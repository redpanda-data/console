// Copyright 2024 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

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

		assert.Len(licensesRes.Msg.GetLicenses(), 2)
		for _, l := range licensesRes.Msg.GetLicenses() {
			assert.Equal(consolev1alpha1.License_TYPE_COMMUNITY.String(), l.Type.String())
		}
	})
}
