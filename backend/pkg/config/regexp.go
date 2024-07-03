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
)

// Regexp adds unmarshalling from json for regexp.Regexp
type Regexp struct {
	*regexp.Regexp
}

// UnmarshalText unmarshals json into a regexp.Regexp
func (r *Regexp) UnmarshalText(b []byte) error {
	regex, err := CompileRegex(string(b))
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

// RegexpOrLiteral adds unmarshalling from json for regexp.Regexp or Literal type.
type RegexpOrLiteral struct {
	literal string
	*regexp.Regexp
}

func (r *RegexpOrLiteral) String() string {
	if r.literal != "" {
		return r.literal
	}
	if r.Regexp != nil {
		return r.Regexp.String()
	}
	return ""
}

// UnmarshalText unmarshals json into a regexp.Regexp
func (r *RegexpOrLiteral) UnmarshalText(b []byte) error {
	regex, err := CompileRegexStrict(string(b))
	if err == nil {
		r.Regexp = regex
	}
	r.literal = string(b)
	return nil
}

// MarshalText marshals regexp.Regexp as string
func (r *RegexpOrLiteral) MarshalText() ([]byte, error) {
	if r.Regexp != nil {
		return []byte(r.Regexp.String()), nil
	}

	return []byte(r.literal), nil
}
