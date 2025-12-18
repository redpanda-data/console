import { create } from '@bufbuild/protobuf';
import { PencilIcon, TrashIcon } from '@heroicons/react/outline';
import {
  Box,
  Button,
  ButtonGroup,
  Link as ChakraLink,
  Code,
  ConfirmItemDeleteModal,
  CopyButton,
  createStandaloneToast,
  DataTable,
  Flex,
  Image,
  SearchField,
  Text,
  Tooltip,
} from '@redpanda-data/ui';
import { observer } from 'mobx-react';
import { Link as ReactRouterLink } from 'react-router-dom';

import SittingPanda from '../../../../assets/redpanda/SittingPanda.svg';
import { DeleteSecretRequestSchema, type Secret } from '../../../../protogen/redpanda/api/dataplane/v1/secret_pb';
import { appGlobal } from '../../../../state/app-global';
import { rpcnSecretManagerApi } from '../../../../state/backend-api';
import { Features } from '../../../../state/supported-features';
import { uiSettings } from '../../../../state/ui';
import PageContent from '../../../misc/page-content';
import Section from '../../../misc/section';
import { PageComponent, type PageInitHelper } from '../../page';

const { ToastContainer, toast } = createStandaloneToast();

const CreateSecretButton = () => (
  <Flex marginBottom={'.5em'}>
    <Button as={ReactRouterLink} data-testid="create-rpcn-secret-button" to={'/rp-connect/secrets/create'}>
      Create secret
    </Button>
  </Flex>
);

const EmptyPlaceholder = () => (
  <Flex alignItems="center" flexDirection="column" gap="4" justifyContent="center" mb="4">
    <Image src={SittingPanda} width={200} />
    <Box>You have no Redpanda Connect secrets.</Box>
    <CreateSecretButton />
  </Flex>
);

@observer
class RpConnectSecretsList extends PageComponent {
  initPage(p: PageInitHelper) {
    p.addBreadcrumb('Redpanda Connect Secret Manager', '/rp-connect/secrets');
    this.refreshData(true);
    appGlobal.onRefresh = () => this.refreshData(true);
  }

  refreshData(force: boolean) {
    if (!Features.pipelinesApi) {
      return;
    }

    rpcnSecretManagerApi.refreshSecrets(force).catch((err) => {
      if (String(err).includes('404')) {
        // Hacky special handling for OSS version, it is possible for the /endpoints request to not complete in time for this to render
        // so in this case there would be an error shown because we were too fast (with rendering, or the req was too slow)
        // We don't want to show an error in that case
        return;
      }

      if (Features.pipelinesApi) {
        toast({
          status: 'error',
          duration: null,
          isClosable: true,
          title: 'Failed to load pipelines',
          description: String(err),
        });
      }
    });
  }

  async deleteSecret(id: string) {
    await rpcnSecretManagerApi.delete(create(DeleteSecretRequestSchema, { id }));
    this.refreshData(true);
  }

  render() {
    const filteredSecrets = (rpcnSecretManagerApi.secrets ?? []).filter((u) => {
      const filter = uiSettings.rpcnSecretList.quickSearch;
      if (!filter) {
        return true;
      }
      try {
        const quickSearchRegExp = new RegExp(filter, 'i');
        if (u.id.match(quickSearchRegExp)) {
          return true;
        }
        return false;
      } catch {
        return false;
      }
    });

    return (
      <PageContent>
        <Section>
          <ToastContainer />

          {rpcnSecretManagerApi.secrets?.length !== 0 && (
            <Flex flexDir={'column'} gap={2} my={5}>
              <CreateSecretButton />
              <SearchField
                placeholderText="Enter search term / regex..."
                searchText={uiSettings.rpcnSecretList.quickSearch}
                setSearchText={(x) => {
                  uiSettings.rpcnSecretList.quickSearch = x;
                }}
                width="350px"
              />
            </Flex>
          )}

          {(rpcnSecretManagerApi.secrets ?? []).length === 0 ? (
            <EmptyPlaceholder />
          ) : (
            <DataTable<Secret>
              columns={[
                {
                  header: 'Secret name',
                  cell: ({ row: { original } }) => (
                    <Text data-testid={`secret-text-${original.id}`}>{original.id}</Text>
                  ),
                  size: 200,
                },
                {
                  header: 'Secret notation',
                  cell: ({ row: { original } }) => (
                    <Box>
                      <Code>
                        <Text whiteSpace="break-spaces" wordBreak="break-word">
                          {`secrets.${original.id}`}
                        </Text>
                      </Code>
                      <Tooltip hasArrow label="Copy">
                        <CopyButton colorScheme="gray" content={`secrets.${original.id}`} size="sm" variant="ghost" />
                      </Tooltip>
                    </Box>
                  ),
                  size: 400,
                },
                {
                  header: 'Pipelines',
                  cell: ({ row: { original } }) => (
                    <Flex alignContent={'stretch'} flexWrap={'wrap'} whiteSpace="break-spaces">
                      {rpcnSecretManagerApi.secretsByPipeline
                        ?.find((x) => x.secretId === original.id)
                        ?.pipelines?.map(({ id, displayName }, index, array) => (
                          <ChakraLink
                            as={ReactRouterLink}
                            key={`pipeline-${id}`}
                            textDecoration={'initial'}
                            to={`/rp-connect/${id}`}
                            wordBreak="break-word"
                          >
                            {displayName} {index !== array.length - 1 ? ', ' : ''}
                          </ChakraLink>
                        ))}
                    </Flex>
                  ),
                  size: 400,
                },
                {
                  header: '',
                  id: 'actions',
                  cell: ({ row: { original: r } }) => (
                    <Flex justifyContent={'flex-end'}>
                      <ButtonGroup>
                        <Button
                          color="gray.500"
                          data-testid={`edit-secret-${r.id}`}
                          height="16px"
                          onClick={(e: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
                            e.stopPropagation();
                            e.preventDefault();
                            appGlobal.historyPush(`/rp-connect/secrets/${r.id}/edit`);
                          }}
                          variant="icon"
                        >
                          <PencilIcon />
                        </Button>
                        <ConfirmItemDeleteModal
                          inputMatchText={r.id}
                          itemType={'Secret'}
                          onConfirm={async (dismiss) => {
                            await this.deleteSecret(r.id);
                            dismiss();
                          }}
                          trigger={
                            <Button color="gray.500" data-testid={`delete-secret-${r.id}`} height="16px" variant="icon">
                              <TrashIcon />
                            </Button>
                          }
                        >
                          <Flex flexDirection={'column'}>
                            <Text>
                              Deleting this secret may disrupt the functionality of pipelines that depend on it. Are you
                              sure?
                            </Text>
                            <Text>
                              To confirm, type <Code>{r.id}</Code> in the confirmation box below.
                            </Text>
                          </Flex>
                        </ConfirmItemDeleteModal>
                      </ButtonGroup>
                    </Flex>
                  ),
                  size: 10,
                },
              ]}
              data={filteredSecrets}
              defaultPageSize={10}
              emptyText=""
              pagination
              sorting
            />
          )}
        </Section>
      </PageContent>
    );
  }
}

export default RpConnectSecretsList;
