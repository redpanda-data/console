package acl

import (
	"testing"

	"github.com/stretchr/testify/assert"

	v1 "github.com/redpanda-data/console/backend/pkg/protogen/redpanda/api/dataplane/v1"
)

func TestTargetBitFlags(t *testing.T) {
	t.Run("IncludesKafka", func(t *testing.T) {
		assert.False(t, targetNone.includesKafka())
		assert.False(t, targetSR.includesKafka())
		assert.True(t, targetKafka.includesKafka())
		assert.True(t, targetBoth.includesKafka())
	})

	t.Run("IncludesSR", func(t *testing.T) {
		assert.False(t, targetNone.includesSR())
		assert.False(t, targetKafka.includesSR())
		assert.True(t, targetSR.includesSR())
		assert.True(t, targetBoth.includesSR())
	})

	t.Run("IsSROnly", func(t *testing.T) {
		assert.True(t, targetSR.isSROnly())
		assert.False(t, targetNone.isSROnly())
		assert.False(t, targetKafka.isSROnly())
		assert.False(t, targetBoth.isSROnly())
	})
}

func TestAnalyzeTarget(t *testing.T) {
	dispatcher := &dispatcher{}

	testCases := []struct {
		name           string
		resourceType   v1.ACL_ResourceType
		expectedTarget targetACL
	}{
		{
			name:           "Registry resource type",
			resourceType:   v1.ACL_RESOURCE_TYPE_REGISTRY,
			expectedTarget: targetSR,
		},
		{
			name:           "Subject resource type",
			resourceType:   v1.ACL_RESOURCE_TYPE_SUBJECT,
			expectedTarget: targetSR,
		},
		{
			name:           "ANY resource type",
			resourceType:   v1.ACL_RESOURCE_TYPE_ANY,
			expectedTarget: targetBoth,
		},
		{
			name:           "Topic resource type",
			resourceType:   v1.ACL_RESOURCE_TYPE_TOPIC,
			expectedTarget: targetKafka,
		},
		{
			name:           "Group resource type",
			resourceType:   v1.ACL_RESOURCE_TYPE_GROUP,
			expectedTarget: targetKafka,
		},
		{
			name:           "Cluster resource type",
			resourceType:   v1.ACL_RESOURCE_TYPE_CLUSTER,
			expectedTarget: targetKafka,
		},
		{
			name:           "Transactional ID resource type",
			resourceType:   v1.ACL_RESOURCE_TYPE_TRANSACTIONAL_ID,
			expectedTarget: targetKafka,
		},
		{
			name:           "Delegation token resource type",
			resourceType:   v1.ACL_RESOURCE_TYPE_DELEGATION_TOKEN,
			expectedTarget: targetKafka,
		},
		{
			name:           "User resource type",
			resourceType:   v1.ACL_RESOURCE_TYPE_USER,
			expectedTarget: targetKafka,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			result := dispatcher.analyzeTarget(tc.resourceType)
			assert.Equal(t, tc.expectedTarget, result, "Expected target for %s to be %v, got %v", tc.name, tc.expectedTarget, result)
		})
	}
}
