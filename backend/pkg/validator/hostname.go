// Copyright 2022 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package validator

import (
	"fmt"
	"net"
	"regexp"
	"strconv"
)

var (
	hostnameRegexStringRFC1123 = `^([a-zA-Z0-9]{1}[a-zA-Z0-9-]{0,62}){1}(\.[a-zA-Z0-9]{1}[a-zA-Z0-9-]{0,62})*?$`
	hostnameRegexRFC1123       = regexp.MustCompile(hostnameRegexStringRFC1123)
)

// IsHostnamePort validates a <dns>:<port> combination for fields typically used for socket address.
func IsHostnamePort(val string) (bool, error) {
	host, port, err := net.SplitHostPort(val)
	if err != nil {
		return false, err
	}
	// Port must be any number 0 > x <= 65535.
	if portNum, err := strconv.ParseInt(port, 10, 32); err != nil || portNum > 65535 || portNum < 1 {
		return false, fmt.Errorf("port must be any number between 1 and 65535")
	}

	// If host is specified, it should match a DNS name
	if host != "" {
		return hostnameRegexRFC1123.MatchString(host), fmt.Errorf("host must match a DNS name")
	}

	return true, nil
}
