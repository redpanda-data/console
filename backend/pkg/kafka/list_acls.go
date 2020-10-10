package kafka

import (
	"github.com/Shopify/sarama"
)

// ListAllACLs sends a DescribeACL request which describes all stored ACLs to Kafka.
//
// Kafka Request documentation:
// DescribeACLsRequest describes ACLs. Describing ACLs works on a filter basis:
// anything that matches the filter is described. Note that there are two
// "types" of filters in this request: the resource filter and the entry
// filter, with entries corresponding to users. The first three fields form the
// resource filter, the last four the entry filter.
func (s *Service) ListAllACLs() ([]sarama.ResourceAcls, error) {
	req := sarama.AclFilter{
		Version:                   0,
		ResourceType:              sarama.AclResourceAny,
		ResourceName:              nil,
		ResourcePatternTypeFilter: sarama.AclPatternAny,
		Principal:                 nil,
		Host:                      nil,
		Operation:                 sarama.AclOperationAny,
		PermissionType:            sarama.AclPermissionAny,
	}
	return s.AdminClient.ListAcls(req)
}

// ListACLs sends a DescribeACL request for one or more specific filters
func (s *Service) ListACLs(req sarama.AclFilter) ([]sarama.ResourceAcls, error) {
	return s.AdminClient.ListAcls(req)
}
