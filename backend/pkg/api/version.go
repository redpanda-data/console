package api

import (
	"os"
	"strconv"
	"time"

	"go.uber.org/zap"
)

type versionInfo struct {
	isBusiness  bool
	productName string

	timestamp         time.Time
	timestampFriendly string

	gitSha string
	gitRef string

	gitShaBusiness string
	gitRefBusiness string
}

// loadVersionInfo loads various environment variables containing information
// about the version/build (git shas, timestamp, branches) into a struct that can be worked with more easily
func loadVersionInfo(logger *zap.Logger) versionInfo {
	version := versionInfo{
		isBusiness:     false,
		gitSha:         os.Getenv("REACT_APP_KOWL_GIT_SHA"),
		gitRef:         os.Getenv("REACT_APP_KOWL_GIT_REF"),
		gitShaBusiness: os.Getenv("REACT_APP_KOWL_BUSINESS_GIT_SHA"),
		gitRefBusiness: os.Getenv("REACT_APP_KOWL_BUSINESS_GIT_REF"),
		timestamp:      time.Time{},
	}

	timestamp := os.Getenv("REACT_APP_KOWL_TIMESTAMP")
	version.productName = "Kowl"
	if version.gitShaBusiness != "" {
		version.productName = "Kowl Business"
		version.isBusiness = true
	}

	// Early out: dev mode
	if version.gitSha == "" {
		version.gitSha = "dev"
		return version
	}

	// Parse timestamp
	t1, err := strconv.ParseInt(timestamp, 10, 64)
	if err != nil {
		logger.Warn("failed to parse timestamp as int64", zap.String("timestamp", timestamp), zap.Error(err))
		version.timestampFriendly = "(parsing error)"
	} else {
		version.timestamp = time.Unix(t1, 0)
		version.timestampFriendly = version.timestamp.Format(time.RFC3339)
	}

	return version
}
