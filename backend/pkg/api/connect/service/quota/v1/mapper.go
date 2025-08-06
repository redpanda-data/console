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

	v1 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1"
)

const (
	clientIDEntityType       = "client-id"
	clientIDPrefixEntityType = "client-id-prefix"
	userEntityType           = "user"
	ipEntityType             = "ip"

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
	case v1.Quota_ENTITY_TYPE_USER:
		entityType = userEntityType
	case v1.Quota_ENTITY_TYPE_IP:
		entityType = ipEntityType
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
func (k kafkaClientMapper) quotaItemsToProto(entries []kmsg.DescribeClientQuotasResponseEntry) ([]*v1.ListQuotasResponse_QuotaEntry, error) {
	var quotaEntries []*v1.ListQuotasResponse_QuotaEntry

	for _, entry := range entries {
		values, err := k.mapQuotaValues(entry.Values)
		if err != nil {
			return nil, err
		}

		for _, entity := range entry.Entity {
			quotaEntry, err := k.mapQuotaEntry(entity, values)
			if err != nil {
				return nil, err
			}
			quotaEntries = append(quotaEntries, quotaEntry)
		}
	}

	return quotaEntries, nil
}

// mapQuotaValues converts Kafka quota values to protobuf values.
func (kafkaClientMapper) mapQuotaValues(values []kmsg.DescribeClientQuotasResponseEntryValue) ([]*v1.Quota_Value, error) {
	var protoValues []*v1.Quota_Value

	for _, value := range values {
		valueType, err := kafkaClientMapper{}.mapKeyToValueType(value.Key)
		if err != nil {
			return nil, err
		}

		protoValues = append(protoValues, &v1.Quota_Value{
			ValueType: valueType,
			Value:     int64(value.Value),
		})
	}

	return protoValues, nil
}

// mapQuotaEntry creates a protobuf quota entry from Kafka entity and values.
func (k kafkaClientMapper) mapQuotaEntry(entity kmsg.DescribeClientQuotasResponseEntryEntity, values []*v1.Quota_Value) (*v1.ListQuotasResponse_QuotaEntry, error) {
	entityType, err := k.mapKafkaEntityType(entity.Type)
	if err != nil {
		return nil, err
	}

	entityName := "<default>"
	if entity.Name != nil {
		entityName = *entity.Name
	}

	return &v1.ListQuotasResponse_QuotaEntry{
		Entity: &v1.Quota_Entity{
			EntityType: entityType,
			EntityName: entityName,
		},
		Values: values,
	}, nil
}

// mapKeyToValueType converts Kafka quota key to protobuf value type.
func (kafkaClientMapper) mapKeyToValueType(key string) (v1.Quota_ValueType, error) {
	switch key {
	case producerByteRateKey:
		return v1.Quota_VALUE_TYPE_PRODUCER_BYTE_RATE, nil
	case consumerByteRateKey:
		return v1.Quota_VALUE_TYPE_CONSUMER_BYTE_RATE, nil
	default:
		return 0, fmt.Errorf("invalid value type: %s", key)
	}
}

// mapKafkaEntityType converts Kafka entity type to protobuf entity type.
func (kafkaClientMapper) mapKafkaEntityType(entityType string) (v1.Quota_EntityType, error) {
	switch entityType {
	case clientIDEntityType:
		return v1.Quota_ENTITY_TYPE_CLIENT_ID, nil
	case clientIDPrefixEntityType:
		return v1.Quota_ENTITY_TYPE_CLIENT_ID_PREFIX, nil
	default:
		return 0, fmt.Errorf("invalid entity type: %s", entityType)
	}
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
	key, err := k.mapValueTypeToKey(req.ValueType)
	if err != nil {
		return nil, err
	}

	operations := []kmsg.AlterClientQuotasRequestEntryOp{
		{
			Key:    key,
			Remove: true,
		},
	}

	entities := []*v1.RequestEntity{req.Entity}
	return k.alterQuotaRequestToKafka(entities, operations)
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
