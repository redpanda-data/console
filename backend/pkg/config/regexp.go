// Copyright 2022 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package config

import (
	"regexp"
	"strings"
)

// Regexp adds unmarshalling from json for regexp.Regexp
type Regexp struct {
	*regexp.Regexp
}

// UnmarshalText unmarshals json into a regexp.Regexp
func (r *Regexp) UnmarshalText(b []byte) error {
	regex, err := compileRegex(string(b))
	if err != nil {
		return err
	}

	r.Regexp = regex

	return nil
}

// MarshalText marshals regexp.Regexp as string
func (r *Regexp) MarshalText() ([]byte, error) {
	if r.Regexp != nil {
		return []byte(r.Regexp.String()), nil
	}

	return nil, nil
}

// compileRegex converts all strings into a regex. Strings that are wrapped into "/"
// will be treated as regex expression and parsed accordingly. All other strings will
// be treated as literal.
func compileRegex(expr string) (*regexp.Regexp, error) {
	if strings.HasPrefix(expr, "/") && strings.HasSuffix(expr, "/") {
		substr := expr[1 : len(expr)-1]
		regex, err := regexp.Compile(substr)
		if err != nil {
			return nil, err
		}

		return regex, nil
	}

	// If this is no regex input (which is marked by the slashes around it) then we escape it so that it's a literal
	regex, err := regexp.Compile("^" + expr + "$")
	if err != nil {
		return nil, err
	}
	return regex, nil
}
