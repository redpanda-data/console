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
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/twmb/franz-go/pkg/kerr"
	"github.com/twmb/franz-go/pkg/kmsg"

	v1 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1"
	v1connect "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1/dataplanev1connect"
)

func (s *APISuite) cleanupQuotas(ctx context.Context) error {
	listReq := kmsg.NewDescribeClientQuotasRequest()

	quotasResp, err := listReq.RequestWith(ctx, s.kafkaClient)
	if err != nil {
		return fmt.Errorf("failed to list quotas: %w", err)
	}
	if kerr.ErrorForCode(quotasResp.ErrorCode) != nil {
		return fmt.Errorf("error listing quotas: %s", kerr.ErrorForCode(quotasResp.ErrorCode))
	}

	entityMap := make(map[string]kmsg.DescribeClientQuotasResponseEntryEntity)
	for _, entry := range quotasResp.Entries {
		for _, entity := range entry.Entity {
			key := entity.Type
			if entity.Name != nil {
				key += ":" + *entity.Name
			} else {
				key += ":<default>"
			}
			entityMap[key] = entity
		}
	}

	var deleteEntries []kmsg.AlterClientQuotasRequestEntry
	for _, entity := range entityMap {
		deleteEntries = append(deleteEntries, kmsg.AlterClientQuotasRequestEntry{
			Entity: []kmsg.AlterClientQuotasRequestEntryEntity{
				{
					Type: entity.Type,
					Name: entity.Name, // This preserves nil for default entities
				},
			},
			Ops: []kmsg.AlterClientQuotasRequestEntryOp{
				{Key: "producer_byte_rate", Remove: true},
				{Key: "consumer_byte_rate", Remove: true},
				{Key: "controller_mutation_rate", Remove: true},
			},
		})
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

func (s *APISuite) TestSetQuota_v1() {
	t := s.T()

	t.Run("set quota for named client (connect-go)", func(t *testing.T) {
		require := require.New(t)
		assert := assert.New(t)

		ctx, cancel := context.WithTimeout(t.Context(), 15*time.Second)
		defer cancel()

		t.Cleanup(func() {
			ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
			defer cancel()
			err := s.cleanupQuotas(ctx)
			assert.NoError(err, "failed to delete all quotas")
		})

		client := v1connect.NewQuotaServiceClient(http.DefaultClient, s.httpAddress())
		setReq := &v1.SetQuotaRequest{
			Entity: &v1.RequestQuotaEntity{
				EntityType: v1.Quota_ENTITY_TYPE_CLIENT_ID,
				EntityName: "console-set-quota-test-connect-go",
			},
			Value: &v1.RequestQuotaValue{
				ValueType: v1.Quota_VALUE_TYPE_PRODUCER_BYTE_RATE,
				Value:     1024000,
			},
		}
		_, err := client.SetQuota(ctx, connect.NewRequest(setReq))
		require.NoError(err)

		// Verify quota was set
		describeReq := kmsg.NewDescribeClientQuotasRequest()
		describeReq.Components = []kmsg.DescribeClientQuotasRequestComponent{
			{
				EntityType: "client-id",
				MatchType:  kmsg.QuotasMatchTypeExact,
				Match:      kmsg.StringPtr("console-set-quota-test-connect-go"),
			},
		}
		describeResp, err := describeReq.RequestWith(ctx, s.kafkaClient)
		require.NoError(err)
		require.Len(describeResp.Entries, 1)

		entry := describeResp.Entries[0]
		require.Len(entry.Entity, 1)
		assert.Equal("client-id", entry.Entity[0].Type)
		assert.Equal("console-set-quota-test-connect-go", *entry.Entity[0].Name)

		require.Len(entry.Values, 1)
		assert.Equal("producer_byte_rate", entry.Values[0].Key)
		assert.Equal(float64(1024000), entry.Values[0].Value)
	})

	t.Run("set default quota (connect-go)", func(t *testing.T) {
		require := require.New(t)
		assert := assert.New(t)

		ctx, cancel := context.WithTimeout(t.Context(), 15*time.Second)
		defer cancel()

		t.Cleanup(func() {
			ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
			defer cancel()
			err := s.cleanupQuotas(ctx)
			assert.NoError(err, "failed to delete all quotas")
		})

		client := v1connect.NewQuotaServiceClient(http.DefaultClient, s.httpAddress())
		setReq := &v1.SetQuotaRequest{
			Entity: &v1.RequestQuotaEntity{
				EntityType: v1.Quota_ENTITY_TYPE_CLIENT_ID,
				EntityName: "", // Empty for default
			},
			Value: &v1.RequestQuotaValue{
				ValueType: v1.Quota_VALUE_TYPE_CONSUMER_BYTE_RATE,
				Value:     512000,
			},
		}
		_, err := client.SetQuota(ctx, connect.NewRequest(setReq))
		require.NoError(err)

		// Verify default quota was set
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
		assert.Equal("consumer_byte_rate", entry.Values[0].Key)
		assert.Equal(float64(512000), entry.Values[0].Value)
	})

	t.Run("set quota for client-id-prefix (connect-go)", func(t *testing.T) {
		require := require.New(t)
		assert := assert.New(t)

		ctx, cancel := context.WithTimeout(t.Context(), 15*time.Second)
		defer cancel()

		t.Cleanup(func() {
			ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
			defer cancel()
			err := s.cleanupQuotas(ctx)
			assert.NoError(err, "failed to delete all quotas")
		})

		client := v1connect.NewQuotaServiceClient(http.DefaultClient, s.httpAddress())
		setReq := &v1.SetQuotaRequest{
			Entity: &v1.RequestQuotaEntity{
				EntityType: v1.Quota_ENTITY_TYPE_CLIENT_ID_PREFIX,
				EntityName: "test-prefix",
			},
			Value: &v1.RequestQuotaValue{
				ValueType: v1.Quota_VALUE_TYPE_CONTROLLER_MUTATION_RATE,
				Value:     100,
			},
		}
		_, err := client.SetQuota(ctx, connect.NewRequest(setReq))
		require.NoError(err)

		// Verify quota was set
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
		assert.Equal("controller_mutation_rate", entry.Values[0].Key)
		assert.Equal(float64(100), entry.Values[0].Value)
	})

	t.Run("set quota with empty name for client-id-prefix should fail (connect-go)", func(t *testing.T) {
		assert := assert.New(t)

		ctx, cancel := context.WithTimeout(t.Context(), 15*time.Second)
		defer cancel()

		client := v1connect.NewQuotaServiceClient(http.DefaultClient, s.httpAddress())
		setReq := &v1.SetQuotaRequest{
			Entity: &v1.RequestQuotaEntity{
				EntityType: v1.Quota_ENTITY_TYPE_CLIENT_ID_PREFIX,
				EntityName: "", // Empty name should fail for prefix
			},
			Value: &v1.RequestQuotaValue{
				ValueType: v1.Quota_VALUE_TYPE_PRODUCER_BYTE_RATE,
				Value:     1000,
			},
		}
		_, err := client.SetQuota(ctx, connect.NewRequest(setReq))
		assert.Error(err)
		assert.Equal(connect.CodeInvalidArgument, connect.CodeOf(err))
	})
}

func (s *APISuite) TestBatchSetQuota_v1() {
	t := s.T()

	t.Run("batch set quotas for multiple entities (connect-go)", func(t *testing.T) {
		require := require.New(t)
		assert := assert.New(t)

		ctx, cancel := context.WithTimeout(t.Context(), 15*time.Second)
		defer cancel()

		t.Cleanup(func() {
			ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
			defer cancel()
			err := s.cleanupQuotas(ctx)
			assert.NoError(err, "failed to delete all quotas")
		})

		client := v1connect.NewQuotaServiceClient(http.DefaultClient, s.httpAddress())
		batchSetReq := &v1.BatchSetQuotaRequest{
			Settings: []*v1.BatchSetQuotaRequest_QuotaSetting{
				{
					Entity: &v1.RequestQuotaEntity{
						EntityType: v1.Quota_ENTITY_TYPE_CLIENT_ID,
						EntityName: "batch-test-client-1",
					},
					Values: []*v1.RequestQuotaValue{
						{
							ValueType: v1.Quota_VALUE_TYPE_PRODUCER_BYTE_RATE,
							Value:     1024000.0,
						},
						{
							ValueType: v1.Quota_VALUE_TYPE_CONSUMER_BYTE_RATE,
							Value:     2048000.0,
						},
					},
				},
				{
					Entity: &v1.RequestQuotaEntity{
						EntityType: v1.Quota_ENTITY_TYPE_CLIENT_ID,
						EntityName: "batch-test-client-2",
					},
					Values: []*v1.RequestQuotaValue{
						{
							ValueType: v1.Quota_VALUE_TYPE_PRODUCER_BYTE_RATE,
							Value:     1024000.0,
						},
						{
							ValueType: v1.Quota_VALUE_TYPE_CONSUMER_BYTE_RATE,
							Value:     2048000.0,
						},
					},
				},
				{
					Entity: &v1.RequestQuotaEntity{
						EntityType: v1.Quota_ENTITY_TYPE_CLIENT_ID_PREFIX,
						EntityName: "batch-test-prefix",
					},
					Values: []*v1.RequestQuotaValue{
						{
							ValueType: v1.Quota_VALUE_TYPE_PRODUCER_BYTE_RATE,
							Value:     1024000.0,
						},
						{
							ValueType: v1.Quota_VALUE_TYPE_CONSUMER_BYTE_RATE,
							Value:     2048000.0,
						},
					},
				},
			},
		}
		res, err := client.BatchSetQuota(ctx, connect.NewRequest(batchSetReq))
		require.NoError(err)
		require.NotNil(res.Msg)

		// Verify response structure
		require.Len(res.Msg.SuccessfulEntities, 3, "expected 3 successful entities")
		require.Len(res.Msg.FailedEntities, 0, "expected no failed entities")

		// Verify all quotas were set
		for i, setting := range batchSetReq.Settings {
			entity := setting.Entity
			var entityType string
			var matchType kmsg.QuotasMatchType
			var match *string

			switch entity.EntityType {
			case v1.Quota_ENTITY_TYPE_CLIENT_ID:
				entityType = "client-id"
			case v1.Quota_ENTITY_TYPE_CLIENT_ID_PREFIX:
				entityType = "client-id-prefix"
			case v1.Quota_ENTITY_TYPE_USER:
				entityType = "user"
			case v1.Quota_ENTITY_TYPE_IP:
				entityType = "ip"
			default:
				require.Failf("invalid entity type", "unknown entity type %v for entity %d", entity.EntityType, i)
			}

			matchType = kmsg.QuotasMatchTypeDefault

			if entity.EntityName != "" {
				matchType = kmsg.QuotasMatchTypeExact
				match = &entity.EntityName
			}

			describeReq := kmsg.NewDescribeClientQuotasRequest()
			describeReq.Components = []kmsg.DescribeClientQuotasRequestComponent{
				{
					EntityType: entityType,
					MatchType:  matchType,
					Match:      match,
				},
			}
			describeResp, err := describeReq.RequestWith(ctx, s.kafkaClient)
			require.NoError(err, "failed to describe quota for entity %d", i)
			require.Len(describeResp.Entries, 1, "expected 1 quota entry for entity %d", i)

			entry := describeResp.Entries[0]
			require.Len(entry.Values, 2, "expected 2 quota values for entity %d", i)

			quotaValues := make(map[string]float64)
			for _, value := range entry.Values {
				quotaValues[value.Key] = value.Value
			}
			assert.Equal(float64(1024000), quotaValues["producer_byte_rate"], "producer rate mismatch for entity %d", i)
			assert.Equal(float64(2048000), quotaValues["consumer_byte_rate"], "consumer rate mismatch for entity %d", i)
		}
	})

	t.Run("batch set with mixed entity types and values (connect-go)", func(t *testing.T) {
		require := require.New(t)
		assert := assert.New(t)

		ctx, cancel := context.WithTimeout(t.Context(), 15*time.Second)
		defer cancel()

		t.Cleanup(func() {
			ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
			defer cancel()
			err := s.cleanupQuotas(ctx)
			assert.NoError(err, "failed to delete all quotas")
		})

		client := v1connect.NewQuotaServiceClient(http.DefaultClient, s.httpAddress())
		batchSetReq := &v1.BatchSetQuotaRequest{
			Settings: []*v1.BatchSetQuotaRequest_QuotaSetting{
				{
					Entity: &v1.RequestQuotaEntity{
						EntityType: v1.Quota_ENTITY_TYPE_CLIENT_ID,
						EntityName: "", // Default quota
					},
					Values: []*v1.RequestQuotaValue{
						{
							ValueType: v1.Quota_VALUE_TYPE_CONTROLLER_MUTATION_RATE,
							Value:     50.0,
						},
					},
				},
			},
		}
		res, err := client.BatchSetQuota(ctx, connect.NewRequest(batchSetReq))
		require.NoError(err)
		require.NotNil(res.Msg)

		// Verify response structure
		require.Len(res.Msg.SuccessfulEntities, 1, "expected 1 successful entity")
		require.Len(res.Msg.FailedEntities, 0, "expected no failed entities")

		// Verify default quota was set
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
		require.Len(entry.Values, 1)
		assert.Equal("controller_mutation_rate", entry.Values[0].Key)
		assert.Equal(float64(50), entry.Values[0].Value)
	})
}

func (s *APISuite) TestListQuotas_v1() {
	t := s.T()

	t.Run("list quotas with filter (connect-go)", func(t *testing.T) {
		require := require.New(t)
		assert := assert.New(t)

		ctx, cancel := context.WithTimeout(t.Context(), 30*time.Second)
		defer cancel()

		t.Cleanup(func() {
			ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
			defer cancel()
			err := s.cleanupQuotas(ctx)
			assert.NoError(err, "failed to delete all quotas")
		})

		// Create test data
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
			Filter: &v1.ListQuotasRequest_Filter{
				EntityType: v1.Quota_ENTITY_TYPE_CLIENT_ID,
			},
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

		quotaValues := make(map[v1.Quota_ValueType]float64)
		for _, value := range foundQuota.Values {
			quotaValues[value.ValueType] = value.Value
		}
		assert.Equal(float64(1024000), quotaValues[v1.Quota_VALUE_TYPE_PRODUCER_BYTE_RATE])
		assert.Equal(float64(2048000), quotaValues[v1.Quota_VALUE_TYPE_CONSUMER_BYTE_RATE])
	})

	t.Run("list quotas with entity name filter (connect-go)", func(t *testing.T) {
		require := require.New(t)
		assert := assert.New(t)

		ctx, cancel := context.WithTimeout(t.Context(), 30*time.Second)
		defer cancel()

		t.Cleanup(func() {
			ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
			defer cancel()
			err := s.cleanupQuotas(ctx)
			assert.NoError(err, "failed to delete all quotas")
		})

		// Create test data
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
			Filter: &v1.ListQuotasRequest_Filter{
				EntityType: v1.Quota_ENTITY_TYPE_CLIENT_ID,
				EntityName: "specific-client",
			},
		}))
		require.NoError(err)
		require.NotNil(res.Msg)

		require.Len(res.Msg.Quotas, 1)
		quota := res.Msg.Quotas[0]
		assert.Equal("specific-client", quota.Entity.EntityName)
		assert.Equal(v1.Quota_ENTITY_TYPE_CLIENT_ID, quota.Entity.EntityType)
	})

	t.Run("list quotas with pagination (connect-go)", func(t *testing.T) {
		require := require.New(t)
		assert := assert.New(t)

		ctx, cancel := context.WithTimeout(t.Context(), 30*time.Second)
		defer cancel()

		t.Cleanup(func() {
			ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
			defer cancel()
			err := s.cleanupQuotas(ctx)
			assert.NoError(err, "failed to delete all quotas")
		})

		// Create multiple test quotas
		createReq := kmsg.NewAlterClientQuotasRequest()
		createReq.Entries = []kmsg.AlterClientQuotasRequestEntry{
			{
				Entity: []kmsg.AlterClientQuotasRequestEntryEntity{
					{Type: "client-id", Name: kmsg.StringPtr("page-test-client-1")},
				},
				Ops: []kmsg.AlterClientQuotasRequestEntryOp{
					{Key: "producer_byte_rate", Value: 1000, Remove: false},
				},
			},
			{
				Entity: []kmsg.AlterClientQuotasRequestEntryEntity{
					{Type: "client-id", Name: kmsg.StringPtr("page-test-client-2")},
				},
				Ops: []kmsg.AlterClientQuotasRequestEntryOp{
					{Key: "producer_byte_rate", Value: 2000, Remove: false},
				},
			},
			{
				Entity: []kmsg.AlterClientQuotasRequestEntryEntity{
					{Type: "client-id", Name: kmsg.StringPtr("page-test-client-3")},
				},
				Ops: []kmsg.AlterClientQuotasRequestEntryOp{
					{Key: "producer_byte_rate", Value: 3000, Remove: false},
				},
			},
		}
		_, err := createReq.RequestWith(ctx, s.kafkaClient)
		require.NoError(err)

		client := v1connect.NewQuotaServiceClient(http.DefaultClient, s.httpAddress())

		// First page
		res, err := client.ListQuotas(ctx, connect.NewRequest(&v1.ListQuotasRequest{
			Filter: &v1.ListQuotasRequest_Filter{
				EntityType: v1.Quota_ENTITY_TYPE_CLIENT_ID,
			},
			PageSize: 2,
		}))
		require.NoError(err)
		require.NotNil(res.Msg)
		assert.LessOrEqual(len(res.Msg.Quotas), 2)
		assert.NotEmpty(res.Msg.PageToken, "should have next page token")

		// Second page
		if res.Msg.PageToken != "" {
			res2, err := client.ListQuotas(ctx, connect.NewRequest(&v1.ListQuotasRequest{
				Filter: &v1.ListQuotasRequest_Filter{
					EntityType: v1.Quota_ENTITY_TYPE_CLIENT_ID,
				},
				PageSize:  2,
				PageToken: res.Msg.PageToken,
			}))
			require.NoError(err)
			require.NotNil(res2.Msg)
			assert.GreaterOrEqual(len(res2.Msg.Quotas), 1)
		}
	})

	t.Run("list quotas with match_default filter (connect-go)", func(t *testing.T) {
		require := require.New(t)
		assert := assert.New(t)

		ctx, cancel := context.WithTimeout(t.Context(), 30*time.Second)
		defer cancel()

		t.Cleanup(func() {
			ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
			defer cancel()
			err := s.cleanupQuotas(ctx)
			assert.NoError(err, "failed to delete all quotas")
		})

		// Create both default and named quotas to test filtering
		createReq := kmsg.NewAlterClientQuotasRequest()
		createReq.Entries = []kmsg.AlterClientQuotasRequestEntry{
			{
				Entity: []kmsg.AlterClientQuotasRequestEntryEntity{
					{
						Type: "client-id",
						Name: nil, // Default quota
					},
				},
				Ops: []kmsg.AlterClientQuotasRequestEntryOp{
					{Key: "producer_byte_rate", Value: 1024000, Remove: false},
				},
			},
			{
				Entity: []kmsg.AlterClientQuotasRequestEntryEntity{
					{
						Type: "client-id",
						Name: kmsg.StringPtr("named-client"),
					},
				},
				Ops: []kmsg.AlterClientQuotasRequestEntryOp{
					{Key: "producer_byte_rate", Value: 2048000, Remove: false},
				},
			},
		}
		_, err := createReq.RequestWith(ctx, s.kafkaClient)
		require.NoError(err)

		client := v1connect.NewQuotaServiceClient(http.DefaultClient, s.httpAddress())

		// Test with match_default = true - should only return default quota
		res, err := client.ListQuotas(ctx, connect.NewRequest(&v1.ListQuotasRequest{
			Filter: &v1.ListQuotasRequest_Filter{
				EntityType:   v1.Quota_ENTITY_TYPE_CLIENT_ID,
				MatchDefault: true,
			},
		}))
		require.NoError(err)
		require.NotNil(res.Msg)

		// Should find exactly one default quota
		require.Len(res.Msg.Quotas, 1)
		quota := res.Msg.Quotas[0]
		assert.Equal(v1.Quota_ENTITY_TYPE_CLIENT_ID, quota.Entity.EntityType)
		assert.Equal("<default>", quota.Entity.EntityName)
	})
}

func (s *APISuite) TestDeleteQuota_v1() {
	t := s.T()

	t.Run("delete quota for named client (connect-go)", func(t *testing.T) {
		require := require.New(t)
		assert := assert.New(t)

		ctx, cancel := context.WithTimeout(t.Context(), 30*time.Second)
		defer cancel()

		t.Cleanup(func() {
			ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
			defer cancel()
			err := s.cleanupQuotas(ctx)
			assert.NoError(err, "failed to delete all quotas")
		})

		// Create test quota
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
			Entity: &v1.RequestQuotaEntity{
				EntityType: v1.Quota_ENTITY_TYPE_CLIENT_ID,
				EntityName: "console-delete-test-client",
			},
			ValueType: v1.Quota_VALUE_TYPE_PRODUCER_BYTE_RATE,
		}
		_, err = client.DeleteQuota(ctx, connect.NewRequest(deleteReq))
		require.NoError(err)

		// Delete second quota value
		deleteReq.ValueType = v1.Quota_VALUE_TYPE_CONSUMER_BYTE_RATE
		_, err = client.DeleteQuota(ctx, connect.NewRequest(deleteReq))
		require.NoError(err)

		// Verify quota was deleted
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

		t.Cleanup(func() {
			ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
			defer cancel()
			err := s.cleanupQuotas(ctx)
			assert.NoError(err, "failed to delete all quotas")
		})

		// Create default quota
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
			Entity: &v1.RequestQuotaEntity{
				EntityType: v1.Quota_ENTITY_TYPE_CLIENT_ID,
				EntityName: "", // Empty for default quota
			},
			ValueType: v1.Quota_VALUE_TYPE_PRODUCER_BYTE_RATE,
		}
		_, err = client.DeleteQuota(ctx, connect.NewRequest(deleteReq))
		require.NoError(err)

		// Verify default quota was deleted
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
}

func (s *APISuite) TestBatchDeleteQuota_v1() {
	t := s.T()

	t.Run("batch delete quotas for multiple entities (connect-go)", func(t *testing.T) {
		require := require.New(t)
		assert := assert.New(t)

		ctx, cancel := context.WithTimeout(t.Context(), 30*time.Second)
		defer cancel()

		t.Cleanup(func() {
			ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
			defer cancel()
			err := s.cleanupQuotas(ctx)
			assert.NoError(err, "failed to delete all quotas")
		})

		// Create test quotas
		createReq := kmsg.NewAlterClientQuotasRequest()
		createReq.Entries = []kmsg.AlterClientQuotasRequestEntry{
			{
				Entity: []kmsg.AlterClientQuotasRequestEntryEntity{
					{Type: "client-id", Name: kmsg.StringPtr("batch-delete-client-1")},
				},
				Ops: []kmsg.AlterClientQuotasRequestEntryOp{
					{Key: "producer_byte_rate", Value: 1024000, Remove: false},
					{Key: "consumer_byte_rate", Value: 2048000, Remove: false},
				},
			},
			{
				Entity: []kmsg.AlterClientQuotasRequestEntryEntity{
					{Type: "client-id", Name: kmsg.StringPtr("batch-delete-client-2")},
				},
				Ops: []kmsg.AlterClientQuotasRequestEntryOp{
					{Key: "producer_byte_rate", Value: 512000, Remove: false},
					{Key: "consumer_byte_rate", Value: 1024000, Remove: false},
				},
			},
		}
		_, err := createReq.RequestWith(ctx, s.kafkaClient)
		require.NoError(err)

		client := v1connect.NewQuotaServiceClient(http.DefaultClient, s.httpAddress())
		batchDeleteReq := &v1.BatchDeleteQuotaRequest{
			Deletions: []*v1.BatchDeleteQuotaRequest_QuotaDeletion{
				{
					Entity: &v1.RequestQuotaEntity{
						EntityType: v1.Quota_ENTITY_TYPE_CLIENT_ID,
						EntityName: "batch-delete-client-1",
					},
					ValueTypes: []v1.Quota_ValueType{
						v1.Quota_VALUE_TYPE_PRODUCER_BYTE_RATE,
						v1.Quota_VALUE_TYPE_CONSUMER_BYTE_RATE,
					},
				},
				{
					Entity: &v1.RequestQuotaEntity{
						EntityType: v1.Quota_ENTITY_TYPE_CLIENT_ID,
						EntityName: "batch-delete-client-2",
					},
					ValueTypes: []v1.Quota_ValueType{
						v1.Quota_VALUE_TYPE_PRODUCER_BYTE_RATE,
						v1.Quota_VALUE_TYPE_CONSUMER_BYTE_RATE,
					},
				},
			},
		}
		res, err := client.BatchDeleteQuota(ctx, connect.NewRequest(batchDeleteReq))
		require.NoError(err)
		require.NotNil(res.Msg)

		// Verify response structure
		require.Len(res.Msg.SuccessfulEntities, 2, "expected 2 successful entities")
		require.Len(res.Msg.FailedEntities, 0, "expected no failed entities")

		// Verify quotas were deleted
		for _, deletion := range batchDeleteReq.Deletions {
			entity := deletion.Entity
			describeReq := kmsg.NewDescribeClientQuotasRequest()
			describeReq.Components = []kmsg.DescribeClientQuotasRequestComponent{
				{
					EntityType: "client-id",
					MatchType:  kmsg.QuotasMatchTypeExact,
					Match:      &entity.EntityName,
				},
			}
			describeResp, err := describeReq.RequestWith(ctx, s.kafkaClient)
			require.NoError(err)

			if len(describeResp.Entries) > 0 {
				assert.Len(describeResp.Entries[0].Values, 0, "quotas should have been deleted for entity %s", entity.EntityName)
			}
		}
	})

	t.Run("batch delete partial quotas (connect-go)", func(t *testing.T) {
		require := require.New(t)
		assert := assert.New(t)

		ctx, cancel := context.WithTimeout(t.Context(), 30*time.Second)
		defer cancel()

		t.Cleanup(func() {
			ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
			defer cancel()
			err := s.cleanupQuotas(ctx)
			assert.NoError(err, "failed to delete all quotas")
		})

		// Create test quota with multiple values
		createReq := kmsg.NewAlterClientQuotasRequest()
		createReq.Entries = []kmsg.AlterClientQuotasRequestEntry{
			{
				Entity: []kmsg.AlterClientQuotasRequestEntryEntity{
					{Type: "client-id", Name: kmsg.StringPtr("partial-delete-client")},
				},
				Ops: []kmsg.AlterClientQuotasRequestEntryOp{
					{Key: "producer_byte_rate", Value: 1024000, Remove: false},
					{Key: "consumer_byte_rate", Value: 2048000, Remove: false},
					{Key: "controller_mutation_rate", Value: 100, Remove: false},
				},
			},
		}
		_, err := createReq.RequestWith(ctx, s.kafkaClient)
		require.NoError(err)

		client := v1connect.NewQuotaServiceClient(http.DefaultClient, s.httpAddress())
		batchDeleteReq := &v1.BatchDeleteQuotaRequest{
			Deletions: []*v1.BatchDeleteQuotaRequest_QuotaDeletion{
				{
					Entity: &v1.RequestQuotaEntity{
						EntityType: v1.Quota_ENTITY_TYPE_CLIENT_ID,
						EntityName: "partial-delete-client",
					},
					ValueTypes: []v1.Quota_ValueType{
						v1.Quota_VALUE_TYPE_PRODUCER_BYTE_RATE,
					},
				},
			},
		}
		res, err := client.BatchDeleteQuota(ctx, connect.NewRequest(batchDeleteReq))
		require.NoError(err)
		require.NotNil(res.Msg)

		// Verify response structure
		require.Len(res.Msg.SuccessfulEntities, 1, "expected 1 successful entity")
		require.Len(res.Msg.FailedEntities, 0, "expected no failed entities")

		// Verify only one quota was deleted, others remain
		describeReq := kmsg.NewDescribeClientQuotasRequest()
		describeReq.Components = []kmsg.DescribeClientQuotasRequestComponent{
			{
				EntityType: "client-id",
				MatchType:  kmsg.QuotasMatchTypeExact,
				Match:      kmsg.StringPtr("partial-delete-client"),
			},
		}
		describeResp, err := describeReq.RequestWith(ctx, s.kafkaClient)
		require.NoError(err)
		require.Len(describeResp.Entries, 1)

		entry := describeResp.Entries[0]
		assert.Len(entry.Values, 2, "should have 2 remaining quotas")

		remainingKeys := make([]string, len(entry.Values))
		for i, value := range entry.Values {
			remainingKeys[i] = value.Key
		}
		assert.Contains(remainingKeys, "consumer_byte_rate")
		assert.Contains(remainingKeys, "controller_mutation_rate")
		assert.NotContains(remainingKeys, "producer_byte_rate", "producer quota should have been deleted")
	})
}
