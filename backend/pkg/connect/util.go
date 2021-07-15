package connect

// getMapValueOrString returns the map entry for the given key. If this entry does not exist it will return the
// passed fallback string.
func getMapValueOrString(m map[string]string, key string, fallback string) string {
	if val, exists := m[key]; exists {
		return val
	}

	return fallback
}
