package owl

import (
	"context"
	"fmt"
	"github.com/twmb/franz-go/pkg/kerr"
	"github.com/twmb/franz-go/pkg/kmsg"
)

type APIVersion struct {
	KeyID      int16  `json:"keyId"`
	KeyName    string `json:"keyName"`
	MaxVersion int16  `json:"maxVersion"`
	MinVersion int16  `json:"minVersion"`
}

// GetTopicDetails returns the partition in the topic along with their watermarks
func (s *Service) GetAPIVersions(ctx context.Context) ([]APIVersion, error) {
	versionsRes, err := s.kafkaSvc.GetAPIVersions(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to get kafka api version: %w", err)
	}

	err = kerr.ErrorForCode(versionsRes.ErrorCode)
	if err != nil {
		return nil, fmt.Errorf("failed to get kafka api version. Inner error: %w", err)
	}

	versions := make([]APIVersion, len(versionsRes.ApiKeys))
	for i, version := range versionsRes.ApiKeys {
		versions[i] = APIVersion{
			KeyID:      version.ApiKey,
			KeyName:    kmsg.NameForKey(version.ApiKey),
			MaxVersion: version.MaxVersion,
			MinVersion: version.MinVersion,
		}
	}

	return versions, nil
}
