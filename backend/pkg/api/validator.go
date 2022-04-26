package api

import "regexp"

var (
	isAlpha               = regexp.MustCompile(`^[A-Za-z]+$`).MatchString
	isValidKafkaTopicName = regexp.MustCompile(`^[\w.-]+$`).MatchString
)
