// Copyright 2025 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package quota

import (
	"fmt"

	"github.com/twmb/franz-go/pkg/kmsg"

	"github.com/redpanda-data/console/backend/pkg/console"
	v1 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1"
)

const (
	clientIDEntityType       = "client-id"
	clientIDPrefixEntityType = "client-id-prefix"

	producerByteRateKey = "producer_byte_rate"
	consumerByteRateKey = "consumer_byte_rate"
)

type kafkaClientMapper struct{}

func (kafkaClientMapper) listQuotasRequestToKafka(req *v1.ListQuotasRequest) (*kmsg.DescribeClientQuotasRequest, error) {
	var (
		entityType string
		matchType  kmsg.QuotasMatchType
		match      *string
	)

	// Match entity type and filter type from the request
	switch req.GetEntityType() {
	case v1.Quota_ENTITY_TYPE_CLIENT_ID:
		entityType = clientIDEntityType
	case v1.Quota_ENTITY_TYPE_CLIENT_ID_PREFIX:
		entityType = clientIDPrefixEntityType
	default:
		return nil, fmt.Errorf("invalid entity type: %v", req.GetEntityType())
	}

	switch req.GetFilterType() {
	case v1.ListQuotasRequest_FILTER_TYPE_NAME:
		matchType = kmsg.QuotasMatchTypeExact
	case v1.ListQuotasRequest_FILTER_TYPE_DEFAULT:
		matchType = kmsg.QuotasMatchTypeDefault
	case v1.ListQuotasRequest_FILTER_TYPE_ANY:
		matchType = kmsg.QuotasMatchTypeAny
	default:
		return nil, fmt.Errorf("invalid filter type: %v", req.GetFilterType())
	}

	if req.GetName() != "" {
		match = &req.Name
	}

	return &kmsg.DescribeClientQuotasRequest{
		Components: []kmsg.DescribeClientQuotasRequestComponent{
			{
				EntityType: entityType,
				MatchType:  matchType,
				Match:      match,
			},
		},
	}, nil
}

// quotaItemsToProto maps console quota items to protobuf response.
func (kafkaClientMapper) quotaItemsToProto(items []console.QuotaResponseItem) ([]*v1.ListQuotasResponse_QuotaEntry, error) {
	var quotaEntries []*v1.ListQuotasResponse_QuotaEntry

	for _, item := range items {
		// Map entity type from string to protobuf enum
		var entityType v1.Quota_EntityType
		switch item.EntityType {
		case clientIDEntityType:
			entityType = v1.Quota_ENTITY_TYPE_CLIENT_ID
		case clientIDPrefixEntityType:
			entityType = v1.Quota_ENTITY_TYPE_CLIENT_ID_PREFIX
		default:
			return nil, fmt.Errorf("invalid entity type: %s", item.EntityType)
		}

		// Convert settings to quota values
		var values []*v1.Quota_Value
		for _, setting := range item.Settings {
			var valueType v1.Quota_ValueType
			switch setting.Key {
			case producerByteRateKey:
				valueType = v1.Quota_VALUE_TYPE_PRODUCER_BYTE_RATE
			case consumerByteRateKey:
				valueType = v1.Quota_VALUE_TYPE_CONSUMER_BYTE_RATE
			default:
				return nil, fmt.Errorf("invalid value type: %s", setting.Key)
			}

			values = append(values, &v1.Quota_Value{
				ValueType: valueType,
				Value:     int64(setting.Value),
			})
		}

		// Create quota entry for this item
		quotaEntries = append(quotaEntries, &v1.ListQuotasResponse_QuotaEntry{
			Entity: &v1.Quota_Entity{
				EntityType: entityType,
				EntityName: item.EntityName,
			},
			Values: values,
		})
	}

	return quotaEntries, nil
}

func (k kafkaClientMapper) alterQuotaRequestToKafka(entities []*v1.RequestEntity, operations []kmsg.AlterClientQuotasRequestEntryOp) (*kmsg.AlterClientQuotasRequest, error) {
	var entries []kmsg.AlterClientQuotasRequestEntry

	for _, entity := range entities {
		entityType, err := k.mapEntityType(entity.EntityType)
		if err != nil {
			return nil, err
		}

		entityName, err := k.mapEntityName(entity)
		if err != nil {
			return nil, err
		}

		entries = append(entries, kmsg.AlterClientQuotasRequestEntry{
			Entity: []kmsg.AlterClientQuotasRequestEntryEntity{
				{
					Type: entityType,
					Name: entityName,
				},
			},
			Ops: operations,
		})
	}

	return &kmsg.AlterClientQuotasRequest{
		Entries: entries,
	}, nil
}

func (k kafkaClientMapper) createQuotaRequestToKafka(req *v1.CreateQuotaRequest) (*kmsg.AlterClientQuotasRequest, error) {
	operations := make([]kmsg.AlterClientQuotasRequestEntryOp, len(req.Values))
	for i, value := range req.Values {
		key, err := k.mapValueTypeToKey(value.ValueType)
		if err != nil {
			return nil, err
		}
		operations[i] = kmsg.AlterClientQuotasRequestEntryOp{
			Key:    key,
			Value:  float64(value.Value),
			Remove: false,
		}
	}
	return k.alterQuotaRequestToKafka(req.Entities, operations)
}

func (k kafkaClientMapper) deleteQuotaRequestToKafka(req *v1.DeleteQuotaRequest) (*kmsg.AlterClientQuotasRequest, error) {
	operations := make([]kmsg.AlterClientQuotasRequestEntryOp, len(req.ValueType))
	for i, valueType := range req.ValueType {
		key, err := k.mapValueTypeToKey(valueType)
		if err != nil {
			return nil, err
		}
		operations[i] = kmsg.AlterClientQuotasRequestEntryOp{
			Key:    key,
			Remove: true,
		}
	}
	return k.alterQuotaRequestToKafka(req.Entities, operations)
}

func (kafkaClientMapper) mapEntityType(entityType v1.Quota_EntityType) (string, error) {
	switch entityType {
	case v1.Quota_ENTITY_TYPE_CLIENT_ID:
		return clientIDEntityType, nil
	case v1.Quota_ENTITY_TYPE_CLIENT_ID_PREFIX:
		return clientIDPrefixEntityType, nil
	default:
		return "", fmt.Errorf("invalid entity type: %v", entityType)
	}
}

// mapEntityName converts protobuf entity to Kafka entity name.
func (kafkaClientMapper) mapEntityName(entity *v1.RequestEntity) (*string, error) {
	switch entity.EntityRequestType {
	case v1.RequestEntity_ENTITY_REQUEST_TYPE_NAME:
		return &entity.EntityName, nil
	case v1.RequestEntity_ENTITY_REQUEST_TYPE_DEFAULT:
		return nil, nil // nil represents default quota
	default:
		return nil, fmt.Errorf("invalid entity request type: %v", entity.EntityRequestType)
	}
}

// mapValueTypeToKey converts protobuf value type to Kafka quota key.
func (kafkaClientMapper) mapValueTypeToKey(valueType v1.Quota_ValueType) (string, error) {
	switch valueType {
	case v1.Quota_VALUE_TYPE_PRODUCER_BYTE_RATE:
		return producerByteRateKey, nil
	case v1.Quota_VALUE_TYPE_CONSUMER_BYTE_RATE:
		return consumerByteRateKey, nil
	default:
		return "", fmt.Errorf("invalid value type: %v", valueType)
	}
}
