// Copyright 2023 Redpanda Data, Inc.
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

	v1alpha1 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1alpha1"
	v1alpha1connect "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1alpha1/dataplanev1alpha1connect"
)

func (s *APISuite) TestListConnectors() {
	t := s.T()
	// require := require.New(t)
	assert := assert.New(t)

	t.Run("list conectors with default request (connect-go)", func(t *testing.T) {
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()

		client := v1alpha1connect.NewKafkaConnectServiceClient(http.DefaultClient, s.httpAddress())
		_, err := client.ListConnectors(ctx, connect.NewRequest(
			&v1alpha1.ListConnectorsRequest{
				ClusterName: "foo",
			}))
		assert.Error(err)
		assert.Equal(connect.CodeNotFound, connect.CodeOf(err))
	})
}
