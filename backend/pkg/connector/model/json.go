// Copyright 2023 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package model

import "encoding/json"

// toJSONMapStringAny is a helper function that converts a struct instance to a map[string]any
// by first marshalling that struct to JSON and afterwards unmarshalling it into the map.
// Thus, it's important to note that this only considers JSON properties.
func toJSONMapStringAny(t any) map[string]any {
	var response map[string]any
	data, _ := json.Marshal(t)
	_ = json.Unmarshal(data, &response)

	return response
}
