// Copyright 2022 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package testutil

import (
	"encoding/json"
	"fmt"

	"github.com/golang/mock/gomock"

	"github.com/redpanda-data/console/backend/pkg/kafka"
)

// Order represents an order record for testing purpoces
type Order struct {
	ID string
}

// OrderMatcher can be used in expect functions to assert on Order ID
type OrderMatcher struct {
	expectedID string
	actualID   string
	err        string
}

// Matches implements the Matcher interface for OrderMatcher
func (o *OrderMatcher) Matches(x interface{}) bool {
	if m, ok := x.(*kafka.TopicMessage); ok {
		order := Order{}
		err := json.Unmarshal(m.Value.Payload.Payload, &order)
		if err != nil {
			o.err = fmt.Sprintf("marshal error: %s", err.Error())
			return false
		}

		o.actualID = order.ID

		return order.ID == o.expectedID
	}

	o.err = "value is not a TopicMessage"
	return false
}

// String implements the Stringer interface for OrderMatcher
func (o *OrderMatcher) String() string {
	return fmt.Sprintf("has order ID %s expected order ID %s. err: %s", o.actualID, o.expectedID, o.err)
}

// MatchesOrder creates the Matcher
func MatchesOrder(id string) gomock.Matcher {
	return &OrderMatcher{expectedID: id}
}
