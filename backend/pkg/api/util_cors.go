// Copyright 2023 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package api

import (
	"net/http"
	"net/url"
	"unicode/utf8"
)

// originsCheckFunc takes a list of allowed origins (hosts) and converts it to a func
// that returns true if the requester's origin is allowed to access our endpoints.
// If you pass an empty allowedOrigins slice, the client will default to a same-site origin policy.
// We check origins to protect against CSRF attacks.
func originsCheckFunc(allowedOrigins []string) func(r *http.Request) bool {
	return func(r *http.Request) bool {
		origin := r.Header.Get("Origin")
		if origin == "" {
			// Browsers always send an origin. Other tools can send whatever origin anyways,
			// so let's allow the request if no origin is set.
			return true
		}

		u, err := url.Parse(origin)
		if err != nil {
			return false
		}

		// Check if host is the same as origin
		if equalASCIIFold(r.Host, u.Host) {
			return true
		}

		// Check if it matches any other of the allowed origins
		for _, allowedOrigin := range allowedOrigins {
			isEqual := equalASCIIFold(allowedOrigin, u.Host)
			if isEqual {
				return true
			}
		}

		return false
	}
}

// equalASCIIFold returns true if s is equal to t with ASCII case folding as
// defined in RFC 4790.
// This is copied from Gorilla's websocket library:
// https://github.com/gorilla/websocket/blob/76ecc29eff79f0cedf70c530605e486fc32131d1/util.go#L176-L198
func equalASCIIFold(s, t string) bool {
	for s != "" && t != "" {
		sr, size := utf8.DecodeRuneInString(s)
		s = s[size:]
		tr, size := utf8.DecodeRuneInString(t)
		t = t[size:]
		if sr == tr {
			continue
		}
		if 'A' <= sr && sr <= 'Z' {
			sr = sr + 'a' - 'A'
		}
		if 'A' <= tr && tr <= 'Z' {
			tr = tr + 'a' - 'A'
		}
		if sr != tr {
			return false
		}
	}
	return s == t
}
