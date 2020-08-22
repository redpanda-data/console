package owl

import "fmt"

// TopicDocumentation holds the Markdown with potential metadata (e. g. editor, last edited at etc).
type TopicDocumentation struct {
	Markdown []byte `json:"markdown"`
}

// GetTopicDocumentation returns the documentation for the given topic if available.
func (s *Service) GetTopicDocumentation(topicName string) (*TopicDocumentation, error) {
	if s.gitSvc == nil {
		return nil, fmt.Errorf("git service is not configured")
	}

	markdown, err := s.gitSvc.GetTopicDocumentation(topicName)
	if err != nil {
		// TODO: Add 404 handling?
		return nil, err
	}

	return &TopicDocumentation{
		Markdown: markdown,
	}, nil
}
