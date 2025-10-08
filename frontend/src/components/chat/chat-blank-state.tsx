import { keyframes } from '@emotion/css';
import {
  Box,
  Button,
  ButtonGroup,
  Center,
  Flex,
  Heading,
  HStack,
  Text,
  usePrefersReducedMotion,
  VStack,
} from '@redpanda-data/ui';
import { useEffect, useState } from 'react';
import { FaCode, FaGraduationCap } from 'react-icons/fa';
import { MdCreate } from 'react-icons/md';

type ChatBlankStateProps = {
  onSelectQuestion?: (question: string) => void;
};

const CREATE_EXAMPLE_QUESTIONS = [
  'How do I ingest data into Snowflake with Redpanda via Snowpipe?',
  'Help me create my Redpanda Connect pipeline',
  'What rpk commands do I use to get started with Redpanda Serverless?',
  'Guide me through the steps to configure Redpanda HTTP Proxy',
];

const LEARN_EXAMPLE_QUESTIONS = [
  'What are the main features of Redpanda?',
  'How does Redpanda handle usage based billing?',
  'How can I use Redpanda Terraform provider to manage clusters?',
  'How do I add ACLs to my existing user?',
];

const CODE_EXAMPLE_QUESTIONS = [
  'Generate a Go script to read data from a Kafka topic',
  'Write Python code to create a producer to send messages to a Kafka topic',
  'Use Java to create a consumer to read data from a Kafka topic',
  'How do I create a new topic and connect to Redpanda using Node.js?',
];

export const ChatBlankState = ({ onSelectQuestion }: ChatBlankStateProps) => {
  const [exampleQuestions, setExampleQuestions] = useState<string[]>(CREATE_EXAMPLE_QUESTIONS);
  const [isAnimating, setIsAnimating] = useState(false);
  const prefersReducedMotion = usePrefersReducedMotion();

  const handleQuestionClick = (question: string) => {
    if (onSelectQuestion) {
      onSelectQuestion(question);
    }
  };

  const fadeInAndZoom = keyframes`
    from {
      opacity: 0.75;
      transform: scale(0.95);
    }
    to { 
      opacity: 1;
      transform: scale(1);
    }
  `;

  const fadeIn = keyframes`
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  `;

  const handleCategoryChange = (newQuestions: string[]) => {
    setIsAnimating(true);
    setExampleQuestions(newQuestions);
  };

  useEffect(() => {
    if (isAnimating) {
      const ANIMATION_DURATION_MS = 300;
      const timer = setTimeout(() => {
        setIsAnimating(false);
      }, ANIMATION_DURATION_MS);
      return () => clearTimeout(timer);
    }
  }, [isAnimating]);

  const containerAnimation = prefersReducedMotion ? undefined : `${fadeInAndZoom} 0.3s ease-out forwards`;
  const questionsAnimation = prefersReducedMotion || !isAnimating ? undefined : `${fadeIn} 0.3s ease-out forwards`;

  const buttons = [
    {
      label: 'Create',
      icon: <MdCreate />,
      onClick: () => handleCategoryChange(CREATE_EXAMPLE_QUESTIONS),
    },
    {
      label: 'Learn',
      icon: <FaGraduationCap />,
      onClick: () => handleCategoryChange(LEARN_EXAMPLE_QUESTIONS),
    },
    {
      label: 'Code',
      icon: <FaCode />,
      onClick: () => handleCategoryChange(CODE_EXAMPLE_QUESTIONS),
    },
  ];

  return (
    <Flex alignItems="center" height="100%" justifyContent="center" width="100%">
      <VStack animation={containerAnimation} pt={8} px={{ base: 2, sm: 8 }} spacing={8} width="100%">
        <VStack spacing={4} width="100%">
          <Center width="100%">
            <Heading size="lg">How can I help you?</Heading>
          </Center>
          <ButtonGroup display="flex" flexDirection="row" flexWrap="wrap" gap={5} justifyContent="center">
            {buttons.map((button) => (
              <Button key={button.label} onClick={button.onClick} type="button" variant="outline">
                <HStack spacing={2}>
                  {button.icon}
                  <Text>{button.label}</Text>
                </HStack>
              </Button>
            ))}
          </ButtonGroup>
        </VStack>
        <Box animation={questionsAnimation}>
          <ButtonGroup display="flex" flexDirection="column" mb={4} spacing={0} width="100%">
            {exampleQuestions.map((question, index) => (
              <Button
                key={index}
                onClick={() => handleQuestionClick(question)}
                py={1}
                textAlign="left"
                type="button"
                variant="unstyled"
                width="100%"
              >
                {question}
              </Button>
            ))}
          </ButtonGroup>
        </Box>
      </VStack>
    </Flex>
  );
};
