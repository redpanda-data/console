import {
  Badge,
  Box,
  Button,
  ButtonGroup,
  type ModalProps as ChakraModalProps,
  Code,
  Divider,
  HStack,
  Heading,
  Icon,
  ListItem,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalHeader,
  ModalOverlay,
  Stack,
  Text,
  UnorderedList,
} from '@redpanda-data/ui';
import type { PropsWithChildren, ReactNode } from 'react';
import { HiOutlineExclamationCircle } from 'react-icons/hi';
import type { LintConfigWithPipelineInfo } from 'react-query/api/redpanda-connect';

export const REDPANDA_SUPPORT_SUBMIT_REQUEST_LINK =
  'https://support.redpanda.com/hc/en-us/requests/new?ticket_form_id=360006877853';

export interface ModalProps {
  allowClose?: boolean;
  showCloseIcon?: boolean;
  heading: string | ReactNode;
  children: PropsWithChildren<ReactNode>;
  className?: string; // TODO: Use https://chakra-ui.com/docs/styled-system/component-style
  show: boolean;
  width?: string;
  onHide: () => void;
  onCancel?: () => void;
  size?: ChakraModalProps['size'];
}

interface LintFailureModalProps extends Omit<ModalProps, 'heading' | 'children'> {
  invalidLintConfigList?: LintConfigWithPipelineInfo[];
}

/**
 * @description Formats lint error reason depending on lint error matching regex
 */
const formatLintReason = (reason: string): ReactNode => {
  // Case 1: "unable to infer component type"
  const inferComponentTypeMatch = reason.match(/unable to infer component type: (\w+)/i);
  if (inferComponentTypeMatch) {
    const [, componentType] = inferComponentTypeMatch;
    return (
      <>
        Unable to infer component type: <Code>{componentType}</Code>
      </>
    );
  }

  // Case 2: "field queries not recognised" or "field query is required"
  const fieldQueryMatch = reason.match(/field (\w+) (not recognised|is required)/i);
  if (fieldQueryMatch) {
    const [, fieldName, restOfMessage] = fieldQueryMatch;
    return (
      <>
        Field <Code>{fieldName}</Code> {restOfMessage}
      </>
    );
  }

  // Case 3: "required environment variables were not set: [...]"
  const envVarsMatch = reason.match(/required environment variables were not set: \[(.*)\]/i);
  if (envVarsMatch?.[1]) {
    const [, allVars] = envVarsMatch;
    const allVarsArray = allVars.split(/\s+/).filter(Boolean);
    const secretVars = [...new Set(allVarsArray.filter((envVar) => envVar.startsWith('secrets.')))];
    const envVars = allVarsArray.filter((envVar) => !envVar.startsWith('secrets.'));

    return (
      <>
        {envVars.length > 0 && (
          <Stack spacing={1}>
            <Text>Required environment variables were not set:</Text>
            <UnorderedList spacing={1}>
              {envVars.map((envVar, index) => (
                <ListItem key={`env-${envVar}-${index}`}>
                  <Code>{envVar}</Code>
                </ListItem>
              ))}
            </UnorderedList>
          </Stack>
        )}

        {secretVars.length > 0 && (
          <Stack spacing={1}>
            <Text>Required secrets were not set:</Text>
            <UnorderedList spacing={1}>
              {secretVars.map((secretVar, index) => (
                <ListItem key={`secret-${secretVar}-${index}`}>
                  <Code>{secretVar}</Code>
                </ListItem>
              ))}
            </UnorderedList>
          </Stack>
        )}
      </>
    );
  }

  // Default case: return plain text with first letter capitalized
  return reason.charAt(0).toUpperCase() + reason.slice(1);
};

export const LintFailureModal = ({
  showCloseIcon = false,
  onHide,
  show,
  invalidLintConfigList,
  allowClose = true,
  size,
  ...rest
}: LintFailureModalProps) => {
  if (!invalidLintConfigList || invalidLintConfigList.length === 0) return null;
  console.log('LintFailureModal invalidLintConfigList: ', invalidLintConfigList);

  const handleCreateSupportTicket = () => window.open(REDPANDA_SUPPORT_SUBMIT_REQUEST_LINK);

  return (
    <Box data-testid="lint-failure-modal">
      <Modal
        onClose={onHide}
        isOpen={show}
        isCentered
        closeOnOverlayClick={allowClose}
        closeOnEsc={allowClose}
        size={size}
        onCancel={onHide}
        {...rest}
      >
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>
            <HStack color="brand.500">
              <Icon boxSize={6} as={HiOutlineExclamationCircle} mr={1} />
              <Text>Redpanda Connect pipeline validation failure</Text>
            </HStack>
          </ModalHeader>
          {allowClose && showCloseIcon ? <ModalCloseButton data-testid="modal-close-icon" /> : null}
          <ModalBody mb={4}>
            <Stack spacing={2}>
              <Text>
                The Redpanda Connect pipelines have failed to validate. Please review the following information and
                create a support ticket if the issue persists.
              </Text>
              {invalidLintConfigList?.map((invalidLintConfig, index) => (
                <Stack key={`${invalidLintConfig.pipelineName}-${index}`} spacing={2}>
                  {invalidLintConfig.pipelineName && (
                    <Heading as="h3" size="md" mb={2}>
                      {invalidLintConfig.pipelineName}:
                    </Heading>
                  )}
                  <Stack spacing={2}>
                    <Stack spacing={1}>
                      {invalidLintConfig.pipelineDescription && (
                        <Text as="span" fontSize="sm" color="gray.600" mb={0}>
                          {invalidLintConfig.pipelineDescription}
                        </Text>
                      )}
                      {invalidLintConfig.pipelinePurpose && (
                        <Box>
                          <Badge variant="inverted">{invalidLintConfig.pipelinePurpose}</Badge>
                        </Box>
                      )}
                    </Stack>
                    <UnorderedList>
                      {invalidLintConfig.lints.map((lint, lintIndex) => (
                        <ListItem key={`${lint.reason}-${lintIndex}`}>{formatLintReason(lint.reason)}</ListItem>
                      ))}
                    </UnorderedList>
                  </Stack>
                  {index < invalidLintConfigList.length - 1 && <Divider my={1} />}
                </Stack>
              ))}
            </Stack>

            <ButtonGroup float="right" spacing={4} mt={4}>
              <Button
                data-testid="create-support-ticket"
                variant="brand"
                onClick={handleCreateSupportTicket}
                onAuxClick={handleCreateSupportTicket}
              >
                Create support ticket
              </Button>
              {showCloseIcon ? null : (
                <Button variant="outline" onClick={onHide}>
                  Close
                </Button>
              )}
            </ButtonGroup>
          </ModalBody>
        </ModalContent>
      </Modal>
    </Box>
  );
};
