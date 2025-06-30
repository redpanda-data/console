// Copyright 2025 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package logging

import (
	"net/http"

	"go.uber.org/zap"
)

// UserAgentMiddleware adds the User-Agent string to the logger in the request context
func UserAgentMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()
		logger := FromContext(ctx)

		userAgent := r.Header.Get("user-agent")
		if userAgent == "" {
			userAgent = "unknown"
		}

		decoratedLogger := logger.With(zap.String("user_agent", userAgent))
		ctx = ContextWithLogger(ctx, decoratedLogger)

		next.ServeHTTP(w, r.WithContext(ctx))
	})
}
