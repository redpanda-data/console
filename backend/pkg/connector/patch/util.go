// Copyright 2023 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package patch

import (
	"regexp"
	"strings"
)

var awsRegions = []string{
	"us-east-1",
	"us-east-2",
	"us-west-1",
	"us-west-2",
	"af-south-1",
	"ap-east-1",
	"ap-south-2",
	"ap-southeast-1",
	"ap-southeast-2",
	"ap-southeast-3",
	"ap-southeast-4",
	"ap-south-1",
	"ap-northeast-1",
	"ap-northeast-2",
	"ap-northeast-3",
	"ca-central-1",
	"cn-north-1",
	"cn-northwest-1",
	"eu-central-1",
	"eu-central-2",
	"eu-west-1",
	"eu-west-2",
	"eu-west-3",
	"eu-south-1",
	"eu-south-2",
	"eu-north-1",
	"sa-east-1",
	"me-south-1",
	"me-central-1",
	"us-gov-east-1",
	"us-gov-west-1",
}

func extractType(connectorClass string, classSelectorRegexp string) string {
	re := regexp.MustCompile(classSelectorRegexp)
	match := re.FindStringSubmatch(connectorClass)

	return strings.ToLower(match[1])
}
