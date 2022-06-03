// Copyright 2022 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

package console

// TopicDocumentation holds the Markdown with potential metadata (e. g. editor, last edited at etc).
type TopicDocumentation struct {
	IsEnabled bool   `json:"isEnabled"`
	Markdown  []byte `json:"markdown"`
}

// GetTopicDocumentation returns the documentation for the given topic if available.
func (s *Service) GetTopicDocumentation(topicName string) *TopicDocumentation {
	if s.gitSvc == nil {
		return &TopicDocumentation{
			IsEnabled: false,
			Markdown:  nil,
		}
	}

	markdown := s.gitSvc.GetFileByFilename(topicName)

	return &TopicDocumentation{
		IsEnabled: true,
		Markdown:  markdown.Payload,
	}
}
