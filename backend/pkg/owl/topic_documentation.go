package owl

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
		Markdown:  markdown,
	}
}
