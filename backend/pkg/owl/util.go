package owl

func derefString(s *string) string {
	if s != nil {
		return *s
	}

	return ""
}
