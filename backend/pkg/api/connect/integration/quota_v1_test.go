// Copyright 2025 Redpanda Data, Inc.
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
	"fmt"
	"net/http"
	"testing"
	"time"

	"connectrpc.com/connect"
	"github.com/carlmjohnson/requests"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/twmb/franz-go/pkg/kmsg"

	v1 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1"
	v1connect "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1/dataplanev1connect"
)

func (s *APISuite) cleanupQuotas(ctx context.Context) error {
	listReq := kmsg.NewDescribeClientQuotasRequest()
	listReq.Components = []kmsg.DescribeClientQuotasRequestComponent{
		{
			EntityType: "client-id",
			MatchType:  kmsg.QuotasMatchTypeAny,
		},
		{
			EntityType: "client-id-prefix",
			MatchType:  kmsg.QuotasMatchTypeAny,
		},
	}

	quotasResp, err := listReq.RequestWith(ctx, s.kafkaClient)
	if err != nil {
		return fmt.Errorf("failed to list quotas: %w", err)
	}

	var deleteEntries []kmsg.AlterClientQuotasRequestEntry
	for _, entry := range quotasResp.Entries {
		for _, entity := range entry.Entity {
			deleteEntries = append(deleteEntries, kmsg.AlterClientQuotasRequestEntry{
				Entity: []kmsg.AlterClientQuotasRequestEntryEntity{kmsg.AlterClientQuotasRequestEntryEntity(entity)},
				Ops: []kmsg.AlterClientQuotasRequestEntryOp{
					{Key: "producer_byte_rate", Remove: true},
					{Key: "consumer_byte_rate", Remove: true},
				},
			})
		}
	}

	if len(deleteEntries) > 0 {
		deleteReq := kmsg.NewAlterClientQuotasRequest()
		deleteReq.Entries = deleteEntries
		_, err = deleteReq.RequestWith(ctx, s.kafkaClient)
		if err != nil {
			return fmt.Errorf("failed to delete quotas: %w", err)
		}
	}

	return nil
}

func (s *APISuite) TestCreateQuota_v1() {
	t := s.T()

	t.Run("create quota for named client (connect-go)", func(t *testing.T) {
		require := require.New(t)
		assert := assert.New(t)

		ctx, cancel := context.WithTimeout(t.Context(), 15*time.Second)
		defer cancel()

		defer func() {
			ctx, cancel := context.WithTimeout(t.Context(), 15*time.Second)
			defer cancel()
			err := s.cleanupQuotas(ctx)
			assert.NoError(err, "failed to delete all quotas")
		}()

		client := v1connect.NewQuotaServiceClient(http.DefaultClient, s.httpAddress())
		createReq := &v1.CreateQuotaRequest{
			Entities: []*v1.RequestEntity{
				{
					EntityType:        v1.Quota_ENTITY_TYPE_CLIENT_ID,
					EntityRequestType: v1.RequestEntity_ENTITY_REQUEST_TYPE_NAME,
					EntityName:        "console-create-quota-test-connect-go",
				},
			},
			Values: []*v1.CreateQuotaRequest_RequestValue{
				{
					ValueType: v1.Quota_VALUE_TYPE_PRODUCER_BYTE_RATE,
					Value:     1024000,
				},
				{
					ValueType: v1.Quota_VALUE_TYPE_CONSUMER_BYTE_RATE,
					Value:     2048000,
				},
			},
		}
		_, err := client.CreateQuota(ctx, connect.NewRequest(createReq))
		require.NoError(err)

		describeReq := kmsg.NewDescribeClientQuotasRequest()
		describeReq.Components = []kmsg.DescribeClientQuotasRequestComponent{
			{
				EntityType: "client-id",
				MatchType:  kmsg.QuotasMatchTypeExact,
				Match:      kmsg.StringPtr("console-create-quota-test-connect-go"),
			},
		}
		describeResp, err := describeReq.RequestWith(ctx, s.kafkaClient)
		require.NoError(err)
		require.Len(describeResp.Entries, 1)

		entry := describeResp.Entries[0]
		require.Len(entry.Entity, 1)
		assert.Equal("client-id", entry.Entity[0].Type)
		assert.Equal("console-create-quota-test-connect-go", *entry.Entity[0].Name)

		require.Len(entry.Values, 2)
		quotaValues := make(map[string]float64)
		for _, value := range entry.Values {
			quotaValues[value.Key] = value.Value
		}
		assert.Equal(float64(1024000), quotaValues["producer_byte_rate"])
		assert.Equal(float64(2048000), quotaValues["consumer_byte_rate"])
	})

	t.Run("create default quota (connect-go)", func(t *testing.T) {
		require := require.New(t)
		assert := assert.New(t)

		ctx, cancel := context.WithTimeout(t.Context(), 15*time.Second)
		defer cancel()

		defer func() {
			ctx, cancel := context.WithTimeout(t.Context(), 15*time.Second)
			defer cancel()
			err := s.cleanupQuotas(ctx)
			assert.NoError(err, "failed to delete all quotas")
		}()

		client := v1connect.NewQuotaServiceClient(http.DefaultClient, s.httpAddress())
		createReq := &v1.CreateQuotaRequest{
			Entities: []*v1.RequestEntity{
				{
					EntityType:        v1.Quota_ENTITY_TYPE_CLIENT_ID,
					EntityRequestType: v1.RequestEntity_ENTITY_REQUEST_TYPE_DEFAULT,
				},
			},
			Values: []*v1.CreateQuotaRequest_RequestValue{
				{
					ValueType: v1.Quota_VALUE_TYPE_PRODUCER_BYTE_RATE,
					Value:     512000,
				},
			},
		}
		_, err := client.CreateQuota(ctx, connect.NewRequest(createReq))
		require.NoError(err)

		describeReq := kmsg.NewDescribeClientQuotasRequest()
		describeReq.Components = []kmsg.DescribeClientQuotasRequestComponent{
			{
				EntityType: "client-id",
				MatchType:  kmsg.QuotasMatchTypeDefault,
			},
		}
		describeResp, err := describeReq.RequestWith(ctx, s.kafkaClient)
		require.NoError(err)
		require.Len(describeResp.Entries, 1)

		entry := describeResp.Entries[0]
		require.Len(entry.Entity, 1)
		assert.Equal("client-id", entry.Entity[0].Type)
		assert.Nil(entry.Entity[0].Name)

		require.Len(entry.Values, 1)
		assert.Equal("producer_byte_rate", entry.Values[0].Key)
		assert.Equal(float64(512000), entry.Values[0].Value)
	})

	t.Run("create quota for client-id-prefix (connect-go)", func(t *testing.T) {
		require := require.New(t)
		assert := assert.New(t)

		ctx, cancel := context.WithTimeout(t.Context(), 15*time.Second)
		defer cancel()

		defer func() {
			ctx, cancel := context.WithTimeout(t.Context(), 15*time.Second)
			defer cancel()
			err := s.cleanupQuotas(ctx)
			assert.NoError(err, "failed to delete all quotas")
		}()

		client := v1connect.NewQuotaServiceClient(http.DefaultClient, s.httpAddress())
		createReq := &v1.CreateQuotaRequest{
			Entities: []*v1.RequestEntity{
				{
					EntityType:        v1.Quota_ENTITY_TYPE_CLIENT_ID_PREFIX,
					EntityRequestType: v1.RequestEntity_ENTITY_REQUEST_TYPE_NAME,
					EntityName:        "test-prefix",
				},
			},
			Values: []*v1.CreateQuotaRequest_RequestValue{
				{
					ValueType: v1.Quota_VALUE_TYPE_CONSUMER_BYTE_RATE,
					Value:     256000,
				},
			},
		}
		_, err := client.CreateQuota(ctx, connect.NewRequest(createReq))
		require.NoError(err)

		describeReq := kmsg.NewDescribeClientQuotasRequest()
		describeReq.Components = []kmsg.DescribeClientQuotasRequestComponent{
			{
				EntityType: "client-id-prefix",
				MatchType:  kmsg.QuotasMatchTypeExact,
				Match:      kmsg.StringPtr("test-prefix"),
			},
		}
		describeResp, err := describeReq.RequestWith(ctx, s.kafkaClient)
		require.NoError(err)
		require.Len(describeResp.Entries, 1)

		entry := describeResp.Entries[0]
		require.Len(entry.Entity, 1)
		assert.Equal("client-id-prefix", entry.Entity[0].Type)
		assert.Equal("test-prefix", *entry.Entity[0].Name)

		require.Len(entry.Values, 1)
		assert.Equal("consumer_byte_rate", entry.Values[0].Key)
		assert.Equal(float64(256000), entry.Values[0].Value)
	})

	t.Run("create quota with client-id-prefix and default request type should fail (connect-go)", func(t *testing.T) {
		assert := assert.New(t)

		ctx, cancel := context.WithTimeout(t.Context(), 15*time.Second)
		defer cancel()

		client := v1connect.NewQuotaServiceClient(http.DefaultClient, s.httpAddress())
		createReq := &v1.CreateQuotaRequest{
			Entities: []*v1.RequestEntity{
				{
					EntityType:        v1.Quota_ENTITY_TYPE_CLIENT_ID_PREFIX,
					EntityRequestType: v1.RequestEntity_ENTITY_REQUEST_TYPE_DEFAULT,
				},
			},
			Values: []*v1.CreateQuotaRequest_RequestValue{
				{
					ValueType: v1.Quota_VALUE_TYPE_PRODUCER_BYTE_RATE,
					Value:     1000,
				},
			},
		}
		_, err := client.CreateQuota(ctx, connect.NewRequest(createReq))
		assert.Error(err)
		assert.Equal(connect.CodeInvalidArgument, connect.CodeOf(err))
		assert.Contains(err.Error(), "invalid_argument: provided parameters are invalid")
	})

	t.Run("create quota with invalid entity type (connect-go)", func(t *testing.T) {
		assert := assert.New(t)

		ctx, cancel := context.WithTimeout(t.Context(), 15*time.Second)
		defer cancel()

		client := v1connect.NewQuotaServiceClient(http.DefaultClient, s.httpAddress())
		createReq := &v1.CreateQuotaRequest{
			Entities: []*v1.RequestEntity{
				{
					EntityType:        v1.Quota_EntityType(999),
					EntityRequestType: v1.RequestEntity_ENTITY_REQUEST_TYPE_NAME,
					EntityName:        "test",
				},
			},
			Values: []*v1.CreateQuotaRequest_RequestValue{
				{
					ValueType: v1.Quota_VALUE_TYPE_PRODUCER_BYTE_RATE,
					Value:     1000,
				},
			},
		}
		_, err := client.CreateQuota(ctx, connect.NewRequest(createReq))
		assert.Error(err)
		assert.Equal(connect.CodeInvalidArgument, connect.CodeOf(err))
	})

	t.Run("create quota via HTTP", func(t *testing.T) {
		require := require.New(t)
		assert := assert.New(t)

		ctx, cancel := context.WithTimeout(t.Context(), 15*time.Second)
		defer cancel()

		defer func() {
			ctx, cancel := context.WithTimeout(t.Context(), 15*time.Second)
			defer cancel()
			err := s.cleanupQuotas(ctx)
			assert.NoError(err, "failed to delete all quotas")
		}()

		type createQuotaRequest struct {
			Entities []struct {
				EntityType        string `json:"entity_type"`
				EntityRequestType string `json:"entity_request_type"`
				EntityName        string `json:"entity_name"`
			} `json:"entities"`
			Values []struct {
				ValueType string `json:"value_type"`
				Value     int64  `json:"value"`
			} `json:"values"`
		}

		httpReq := createQuotaRequest{
			Entities: []struct {
				EntityType        string `json:"entity_type"`
				EntityRequestType string `json:"entity_request_type"`
				EntityName        string `json:"entity_name"`
			}{
				{
					EntityType:        "ENTITY_TYPE_CLIENT_ID",
					EntityRequestType: "ENTITY_REQUEST_TYPE_NAME",
					EntityName:        "console-create-quota-test-http",
				},
			},
			Values: []struct {
				ValueType string `json:"value_type"`
				Value     int64  `json:"value"`
			}{
				{
					ValueType: "VALUE_TYPE_PRODUCER_BYTE_RATE",
					Value:     1024000,
				},
			},
		}

		var errResponse string
		err := requests.
			URL(s.httpAddress() + "/v1/quotas").
			BodyJSON(&httpReq).
			Post().
			AddValidator(requests.ValidatorHandler(
				requests.CheckStatus(http.StatusOK),
				requests.ToString(&errResponse),
			)).
			Fetch(ctx)
		assert.Empty(errResponse)
		require.NoError(err)
	})
}

func (s *APISuite) TestListQuotas_v1() {
	t := s.T()

	t.Run("list quotas with seeded data (connect-go)", func(t *testing.T) {
		require := require.New(t)
		assert := assert.New(t)

		ctx, cancel := context.WithTimeout(t.Context(), 30*time.Second)
		defer cancel()

		defer func() {
			ctx, cancel := context.WithTimeout(t.Context(), 15*time.Second)
			defer cancel()
			err := s.cleanupQuotas(ctx)
			assert.NoError(err, "failed to delete all quotas")
		}()

		createReq := kmsg.NewAlterClientQuotasRequest()
		createReq.Entries = []kmsg.AlterClientQuotasRequestEntry{
			{
				Entity: []kmsg.AlterClientQuotasRequestEntryEntity{
					{
						Type: "client-id",
						Name: kmsg.StringPtr("console-test-client"),
					},
				},
				Ops: []kmsg.AlterClientQuotasRequestEntryOp{
					{Key: "producer_byte_rate", Value: 1024000, Remove: false},
					{Key: "consumer_byte_rate", Value: 2048000, Remove: false},
				},
			},
			{
				Entity: []kmsg.AlterClientQuotasRequestEntryEntity{
					{
						Type: "client-id-prefix",
						Name: kmsg.StringPtr("console-test-prefix"),
					},
				},
				Ops: []kmsg.AlterClientQuotasRequestEntryOp{
					{Key: "producer_byte_rate", Value: 512000, Remove: false},
				},
			},
		}
		_, err := createReq.RequestWith(ctx, s.kafkaClient)
		require.NoError(err)

		client := v1connect.NewQuotaServiceClient(http.DefaultClient, s.httpAddress())
		res, err := client.ListQuotas(ctx, connect.NewRequest(&v1.ListQuotasRequest{
			EntityType: v1.Quota_ENTITY_TYPE_CLIENT_ID,
			FilterType: v1.ListQuotasRequest_FILTER_TYPE_ANY,
		}))
		require.NoError(err)
		require.NotNil(res.Msg)

		var foundQuota *v1.ListQuotasResponse_QuotaEntry
		for _, quota := range res.Msg.Quotas {
			if quota.Entity.EntityName == "console-test-client" {
				foundQuota = quota
				break
			}
		}
		require.NotNil(foundQuota, "seeded quota not found in response")

		assert.Equal(v1.Quota_ENTITY_TYPE_CLIENT_ID, foundQuota.Entity.EntityType)
		assert.Equal("console-test-client", foundQuota.Entity.EntityName)
		require.Len(foundQuota.Values, 2)

		quotaValues := make(map[v1.Quota_ValueType]int64)
		for _, value := range foundQuota.Values {
			quotaValues[value.ValueType] = value.Value
		}
		assert.Equal(int64(1024000), quotaValues[v1.Quota_VALUE_TYPE_PRODUCER_BYTE_RATE])
		assert.Equal(int64(2048000), quotaValues[v1.Quota_VALUE_TYPE_CONSUMER_BYTE_RATE])
	})

	t.Run("list quotas with name filter (connect-go)", func(t *testing.T) {
		require := require.New(t)
		assert := assert.New(t)

		ctx, cancel := context.WithTimeout(t.Context(), 30*time.Second)
		defer cancel()

		defer func() {
			ctx, cancel := context.WithTimeout(t.Context(), 15*time.Second)
			defer cancel()
			err := s.cleanupQuotas(ctx)
			assert.NoError(err, "failed to delete all quotas")
		}()

		createReq := kmsg.NewAlterClientQuotasRequest()
		createReq.Entries = []kmsg.AlterClientQuotasRequestEntry{
			{
				Entity: []kmsg.AlterClientQuotasRequestEntryEntity{
					{
						Type: "client-id",
						Name: kmsg.StringPtr("specific-client"),
					},
				},
				Ops: []kmsg.AlterClientQuotasRequestEntryOp{
					{Key: "producer_byte_rate", Value: 1024000, Remove: false},
				},
			},
		}
		_, err := createReq.RequestWith(ctx, s.kafkaClient)
		require.NoError(err)

		client := v1connect.NewQuotaServiceClient(http.DefaultClient, s.httpAddress())
		res, err := client.ListQuotas(ctx, connect.NewRequest(&v1.ListQuotasRequest{
			EntityType: v1.Quota_ENTITY_TYPE_CLIENT_ID,
			FilterType: v1.ListQuotasRequest_FILTER_TYPE_NAME,
			Name:       "specific-client",
		}))
		require.NoError(err)
		require.NotNil(res.Msg)

		require.Len(res.Msg.Quotas, 1)
		quota := res.Msg.Quotas[0]
		assert.Equal("specific-client", quota.Entity.EntityName)
		assert.Equal(v1.Quota_ENTITY_TYPE_CLIENT_ID, quota.Entity.EntityType)
	})

	t.Run("list quotas with invalid entity type (connect-go)", func(t *testing.T) {
		assert := assert.New(t)

		ctx, cancel := context.WithTimeout(t.Context(), 15*time.Second)
		defer cancel()

		client := v1connect.NewQuotaServiceClient(http.DefaultClient, s.httpAddress())
		_, err := client.ListQuotas(ctx, connect.NewRequest(&v1.ListQuotasRequest{
			EntityType: v1.Quota_EntityType(999),
			FilterType: v1.ListQuotasRequest_FILTER_TYPE_ANY,
		}))
		assert.Error(err)
		assert.Equal(connect.CodeInvalidArgument, connect.CodeOf(err))
	})

	t.Run("list quotas via HTTP", func(t *testing.T) {
		require := require.New(t)
		assert := assert.New(t)

		ctx, cancel := context.WithTimeout(t.Context(), 30*time.Second)
		defer cancel()

		defer func() {
			ctx, cancel := context.WithTimeout(t.Context(), 15*time.Second)
			defer cancel()
			err := s.cleanupQuotas(ctx)
			assert.NoError(err, "failed to delete all quotas")
		}()

		createReq := kmsg.NewAlterClientQuotasRequest()
		createReq.Entries = []kmsg.AlterClientQuotasRequestEntry{
			{
				Entity: []kmsg.AlterClientQuotasRequestEntryEntity{
					{
						Type: "client-id",
						Name: kmsg.StringPtr("http-test-client"),
					},
				},
				Ops: []kmsg.AlterClientQuotasRequestEntryOp{
					{Key: "producer_byte_rate", Value: 1024000, Remove: false},
				},
			},
		}
		_, err := createReq.RequestWith(ctx, s.kafkaClient)
		require.NoError(err)

		type listQuotasResponse struct {
			Quotas []struct {
				Entity struct {
					EntityType string `json:"entity_type"`
					EntityName string `json:"entity_name"`
				} `json:"entity"`
				Values []struct {
					ValueType string `json:"value_type"`
					Value     string `json:"value"`
				} `json:"values"`
			} `json:"quotas"`
		}

		var response listQuotasResponse
		var errResponse string
		err = requests.
			URL(s.httpAddress()+"/v1/quotas").
			Param("entity_type", "ENTITY_TYPE_CLIENT_ID").
			Param("filter_type", "FILTER_TYPE_ANY").
			AddValidator(requests.ValidatorHandler(
				requests.CheckStatus(http.StatusOK),
				requests.ToString(&errResponse),
			)).
			ToJSON(&response).
			Fetch(ctx)
		assert.Empty(errResponse)
		require.NoError(err)
		assert.GreaterOrEqual(len(response.Quotas), 1)
	})
}

func (s *APISuite) TestDeleteQuota_v1() {
	t := s.T()

	t.Run("delete quota for named client (connect-go)", func(t *testing.T) {
		require := require.New(t)
		assert := assert.New(t)

		ctx, cancel := context.WithTimeout(t.Context(), 30*time.Second)
		defer cancel()

		defer func() {
			ctx, cancel := context.WithTimeout(t.Context(), 15*time.Second)
			defer cancel()
			err := s.cleanupQuotas(ctx)
			assert.NoError(err, "failed to delete all quotas")
		}()

		createReq := kmsg.NewAlterClientQuotasRequest()
		createReq.Entries = []kmsg.AlterClientQuotasRequestEntry{
			{
				Entity: []kmsg.AlterClientQuotasRequestEntryEntity{
					{
						Type: "client-id",
						Name: kmsg.StringPtr("console-delete-test-client"),
					},
				},
				Ops: []kmsg.AlterClientQuotasRequestEntryOp{
					{Key: "producer_byte_rate", Value: 1024000, Remove: false},
					{Key: "consumer_byte_rate", Value: 2048000, Remove: false},
				},
			},
		}
		_, err := createReq.RequestWith(ctx, s.kafkaClient)
		require.NoError(err)

		client := v1connect.NewQuotaServiceClient(http.DefaultClient, s.httpAddress())
		deleteReq := &v1.DeleteQuotaRequest{
			Entity: &v1.RequestEntity{
				EntityType:        v1.Quota_ENTITY_TYPE_CLIENT_ID,
				EntityRequestType: v1.RequestEntity_ENTITY_REQUEST_TYPE_NAME,
				EntityName:        "console-delete-test-client",
			},
			ValueType: v1.Quota_VALUE_TYPE_PRODUCER_BYTE_RATE,
		}
		_, err = client.DeleteQuota(ctx, connect.NewRequest(deleteReq))
		require.NoError(err)

		deleteReq.ValueType = v1.Quota_VALUE_TYPE_CONSUMER_BYTE_RATE
		_, err = client.DeleteQuota(ctx, connect.NewRequest(deleteReq))
		require.NoError(err)

		describeReq := kmsg.NewDescribeClientQuotasRequest()
		describeReq.Components = []kmsg.DescribeClientQuotasRequestComponent{
			{
				EntityType: "client-id",
				MatchType:  kmsg.QuotasMatchTypeExact,
				Match:      kmsg.StringPtr("console-delete-test-client"),
			},
		}
		describeResp, err := describeReq.RequestWith(ctx, s.kafkaClient)
		require.NoError(err)

		if len(describeResp.Entries) > 0 {
			assert.Len(describeResp.Entries[0].Values, 0, "quota should have been deleted")
		}
	})

	t.Run("delete default quota (connect-go)", func(t *testing.T) {
		require := require.New(t)
		assert := assert.New(t)

		ctx, cancel := context.WithTimeout(t.Context(), 30*time.Second)
		defer cancel()

		defer func() {
			ctx, cancel := context.WithTimeout(t.Context(), 15*time.Second)
			defer cancel()
			err := s.cleanupQuotas(ctx)
			assert.NoError(err, "failed to delete all quotas")
		}()

		createReq := kmsg.NewAlterClientQuotasRequest()
		createReq.Entries = []kmsg.AlterClientQuotasRequestEntry{
			{
				Entity: []kmsg.AlterClientQuotasRequestEntryEntity{
					{
						Type: "client-id",
						Name: nil,
					},
				},
				Ops: []kmsg.AlterClientQuotasRequestEntryOp{
					{Key: "producer_byte_rate", Value: 512000, Remove: false},
				},
			},
		}
		_, err := createReq.RequestWith(ctx, s.kafkaClient)
		require.NoError(err)

		client := v1connect.NewQuotaServiceClient(http.DefaultClient, s.httpAddress())
		deleteReq := &v1.DeleteQuotaRequest{
			Entity: &v1.RequestEntity{
				EntityType:        v1.Quota_ENTITY_TYPE_CLIENT_ID,
				EntityRequestType: v1.RequestEntity_ENTITY_REQUEST_TYPE_DEFAULT,
			},
			ValueType: v1.Quota_VALUE_TYPE_PRODUCER_BYTE_RATE,
		}
		_, err = client.DeleteQuota(ctx, connect.NewRequest(deleteReq))
		require.NoError(err)

		describeReq := kmsg.NewDescribeClientQuotasRequest()
		describeReq.Components = []kmsg.DescribeClientQuotasRequestComponent{
			{
				EntityType: "client-id",
				MatchType:  kmsg.QuotasMatchTypeDefault,
			},
		}
		describeResp, err := describeReq.RequestWith(ctx, s.kafkaClient)
		require.NoError(err)

		if len(describeResp.Entries) > 0 {
			assert.Len(describeResp.Entries[0].Values, 0, "default quota should have been deleted")
		}
	})

	t.Run("delete quota with invalid value type (connect-go)", func(t *testing.T) {
		assert := assert.New(t)

		ctx, cancel := context.WithTimeout(t.Context(), 15*time.Second)
		defer cancel()

		client := v1connect.NewQuotaServiceClient(http.DefaultClient, s.httpAddress())
		deleteReq := &v1.DeleteQuotaRequest{
			Entity: &v1.RequestEntity{
				EntityType:        v1.Quota_ENTITY_TYPE_CLIENT_ID,
				EntityRequestType: v1.RequestEntity_ENTITY_REQUEST_TYPE_NAME,
				EntityName:        "test",
			},
			ValueType: v1.Quota_ValueType(999),
		}
		_, err := client.DeleteQuota(ctx, connect.NewRequest(deleteReq))
		assert.Error(err)
		assert.Equal(connect.CodeInvalidArgument, connect.CodeOf(err))
	})

	t.Run("delete quota via HTTP", func(t *testing.T) {
		require := require.New(t)
		assert := assert.New(t)

		ctx, cancel := context.WithTimeout(t.Context(), 30*time.Second)
		defer cancel()

		defer func() {
			ctx, cancel := context.WithTimeout(t.Context(), 15*time.Second)
			defer cancel()
			err := s.cleanupQuotas(ctx)
			assert.NoError(err, "failed to delete all quotas")
		}()

		createReq := kmsg.NewAlterClientQuotasRequest()
		createReq.Entries = []kmsg.AlterClientQuotasRequestEntry{
			{
				Entity: []kmsg.AlterClientQuotasRequestEntryEntity{
					{
						Type: "client-id",
						Name: kmsg.StringPtr("http-delete-test-client"),
					},
				},
				Ops: []kmsg.AlterClientQuotasRequestEntryOp{
					{Key: "producer_byte_rate", Value: 1024000, Remove: false},
				},
			},
		}
		_, err := createReq.RequestWith(ctx, s.kafkaClient)
		require.NoError(err)

		var errResponse string
		err = requests.
			URL(s.httpAddress()+"/v1/quotas").
			Param("entity.entity_type", "ENTITY_TYPE_CLIENT_ID").
			Param("entity.entity_request_type", "ENTITY_REQUEST_TYPE_NAME").
			Param("entity.entity_name", "http-delete-test-client").
			Param("value_type", "VALUE_TYPE_PRODUCER_BYTE_RATE").
			Delete().
			AddValidator(requests.ValidatorHandler(
				requests.CheckStatus(http.StatusOK),
				requests.ToString(&errResponse),
			)).
			Fetch(ctx)
		assert.Empty(errResponse)
		require.NoError(err)
	})
}
