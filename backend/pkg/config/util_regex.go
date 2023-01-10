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
	"fmt"
	"regexp"
	"strings"
)

// CompileRegex compiles a regex string to a regexp.Regexp.
func CompileRegex(expr string) (*regexp.Regexp, error) {
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

// CompileRegexes compiles multiple regex strings to multiple regexp.Regexp.
func CompileRegexes(expr []string) ([]*regexp.Regexp, error) {
	compiledExpressions := make([]*regexp.Regexp, len(expr))
	for i, exprStr := range expr {
		expr, err := CompileRegex(exprStr)
		if err != nil {
			return nil, fmt.Errorf("failed to compile expression string '%v': %w", exprStr, err)
		}
		compiledExpressions[i] = expr
	}

	return compiledExpressions, nil
}
