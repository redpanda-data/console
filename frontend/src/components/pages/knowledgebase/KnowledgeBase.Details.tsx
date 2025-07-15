/**
 * Copyright 2024 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { Box, Button, createStandaloneToast, Flex, Heading, HStack, Text } from '@redpanda-data/ui';
import { makeObservable, observable } from 'mobx';
import { observer } from 'mobx-react';
import React from 'react';
import { Link as RouterLink } from 'react-router-dom';
import type {
  KnowledgeBase,
  KnowledgeBaseUpdate,
} from '../../../protogen/redpanda/api/dataplane/v1alpha1/knowledge_base_pb';
import { appGlobal } from '../../../state/appGlobal';
import { api, knowledgebaseApi, rpcnSecretManagerApi } from '../../../state/backendApi';
import { Features } from '../../../state/supportedFeatures';
import { openModal } from '../../../utils/ModalContainer';
import { DefaultSkeleton } from '../../../utils/tsxUtils';
import PageContent from '../../misc/PageContent';
import { ShortNum } from '../../misc/ShortNum';
import { PageComponent, type PageInitHelper } from '../Page';
import { ExplicitConfirmModal } from '../rp-connect/modals';
import { KnowledgeBaseEditTabs } from './KnowledgeBase.EditTabs';

const { ToastContainer, toast } = createStandaloneToast();

interface KnowledgeBaseDetailsProps {
  knowledgebaseId: string;
}

@observer
class KnowledgeBaseDetails extends PageComponent<KnowledgeBaseDetailsProps> {
  @observable knowledgeBase: KnowledgeBase | null = null;
  @observable loading = true;
  @observable isEditMode = false;
  @observable isUpdating = false;
  @observable hasChanges = false;
  @observable consumerGroupLoading = false;
  @observable consumerGroupLoadFailed = false;

  private editTabsRef: React.RefObject<any> = React.createRef();

  constructor(p: any) {
    super(p);
    makeObservable(this);
  }

  initPage(p: PageInitHelper): void {
    const { knowledgebaseId } = this.props;

    // Set up breadcrumbs for view mode (edit mode will be handled in-place)
    p.addBreadcrumb('Knowledge Bases', '/knowledgebases');
    p.addBreadcrumb(knowledgebaseId, `/knowledgebases/${knowledgebaseId}`);

    this.refreshData();
    appGlobal.onRefresh = () => this.refreshData();
  }

  refreshData(): void {
    if (!Features.pipelinesApi) return;

    this.loading = true;

    // Load knowledge base and secrets in parallel
    Promise.all([
      knowledgebaseApi.getKnowledgeBase(this.props.knowledgebaseId),
      rpcnSecretManagerApi.refreshSecrets(true).catch((err) => {
        // Silently handle secrets loading error - secrets are optional
        console.warn('KnowledgeBase.Details: Failed to load secrets for Knowledge Base page:', err);
      }),
    ])
      .then(([kb]) => {
        this.knowledgeBase = kb;
        // Load consumer group data after knowledge base is loaded
        this.loadConsumerGroupData();
      })
      .catch((err) => {
        toast({
          status: 'error',
          duration: null,
          isClosable: true,
          title: 'Failed to load knowledge base',
          description: String(err),
        });
      })
      .finally(() => {
        this.loading = false;
      });
  }

  loadConsumerGroupData = async (): Promise<void> => {
    if (!this.knowledgeBase) return;

    const consumerGroupId = `${this.knowledgeBase.id}-indexer`;
    this.consumerGroupLoading = true;
    this.consumerGroupLoadFailed = false;

    try {
      await api.refreshConsumerGroup(consumerGroupId, true);
    } catch (err) {
      // Consumer group might not exist yet (created asynchronously)
      // or there might be other errors - gracefully degrade
      this.consumerGroupLoadFailed = true;

      // Log different types of errors for debugging
      const errorStr = String(err);
      if (errorStr.includes('404') || errorStr.includes('not found')) {
        console.log(
          `KnowledgeBase.Details: Consumer group '${consumerGroupId}' not found yet (likely still being created)`,
        );
      } else {
        console.warn('KnowledgeBase.Details: Failed to load consumer group data:', err);
      }
    } finally {
      this.consumerGroupLoading = false;
    }
  };

  get consumerGroup() {
    if (!this.knowledgeBase) return null;
    const consumerGroupId = `${this.knowledgeBase.id}-indexer`;
    return api.consumerGroups.get(consumerGroupId);
  }

  handleUpdate = async (updatedKnowledgeBase: KnowledgeBaseUpdate, updateMask?: string[]) => {
    if (!this.knowledgeBase) return;

    this.isUpdating = true;
    try {
      await knowledgebaseApi.updateKnowledgeBase(this.knowledgeBase.id, updatedKnowledgeBase, updateMask);

      toast({
        status: 'success',
        duration: 4000,
        isClosable: false,
        title: 'Knowledge base updated successfully',
      });

      // Refresh the data and exit edit mode
      await this.refreshData();
      this.isEditMode = false;
    } catch (err) {
      toast({
        status: 'error',
        duration: null,
        isClosable: true,
        title: 'Failed to update knowledge base',
        description: String(err),
      });
      throw err; // Re-throw so the edit component can handle it
    } finally {
      this.isUpdating = false;
    }
  };

  handleStartEdit = () => {
    this.isEditMode = true;
    this.hasChanges = false;
  };

  handleCancelEdit = () => {
    this.isEditMode = false;
    this.hasChanges = false;
  };

  handleSave = async () => {
    if (this.editTabsRef.current) {
      await this.editTabsRef.current.handleSave();
    }
  };

  onFormChange = (hasChanges: boolean) => {
    this.hasChanges = hasChanges;
  };

  openDeleteKnowledgeBaseModal = () => {
    if (!this.knowledgeBase) return;

    openModal(ExplicitConfirmModal, {
      title: <>Delete Knowledge Base</>,
      body: (
        <Box>
          <Text>Are you sure you want to delete the knowledge base "{this.knowledgeBase.displayName}"?</Text>
          <Text mt={2} color="red.600" fontSize="sm">
            This action cannot be undone.
          </Text>
        </Box>
      ),
      primaryButtonContent: <>Delete</>,
      secondaryButtonContent: <>Cancel</>,

      requiredText: this.knowledgeBase.displayName.trim(),

      onPrimaryButton: (closeModal) => {
        this.handleDeleteConfirmed();
        closeModal();
      },

      onSecondaryButton: (closeModal) => {
        closeModal();
      },
    });
  };

  handleDeleteConfirmed = async () => {
    if (!this.knowledgeBase) return;

    try {
      await knowledgebaseApi.deleteKnowledgeBase(this.knowledgeBase.id);

      toast({
        status: 'success',
        duration: 4000,
        isClosable: false,
        title: 'Knowledge base deleted',
      });

      // Navigate back to the list
      appGlobal.historyPush('/knowledgebases');
    } catch (err) {
      toast({
        status: 'error',
        duration: null,
        isClosable: true,
        title: 'Failed to delete knowledge base',
        description: String(err),
      });
    }
  };

  renderKnowledgeBaseDetails(): JSX.Element {
    if (!this.knowledgeBase) return <Box>Knowledge base not found</Box>;

    const kb = this.knowledgeBase;

    return (
      <Box>
        <Flex justifyContent="space-between" alignItems="center" mb={6}>
          <Heading size="lg">{kb.displayName}</Heading>
          <Flex gap={2}>
            {this.isEditMode ? (
              <>
                <Button variant="outline" onClick={this.handleCancelEdit}>
                  Cancel
                </Button>
                <Button
                  colorScheme="darkblue"
                  onClick={this.handleSave}
                  isLoading={this.loading}
                  loadingText="Saving..."
                  isDisabled={!this.hasChanges}
                >
                  Save Changes
                </Button>
              </>
            ) : (
              <Button colorScheme="darkblue" onClick={this.handleStartEdit}>
                Edit
              </Button>
            )}
            <Button colorScheme="red" variant="outline" onClick={this.openDeleteKnowledgeBaseModal}>
              Delete
            </Button>
          </Flex>
        </Flex>

        {/* Consumer Lag Section */}
        <Box mb={6} p={4} bg="gray.50" borderRadius="md">
          <HStack spacing={6}>
            <Box>
              <Text fontSize="sm" fontWeight="medium" color="gray.600">
                Indexer Status
              </Text>
              {this.consumerGroup ? (
                <HStack spacing={2}>
                  <Text fontSize="lg" fontWeight="semibold">
                    {this.consumerGroup.state}
                  </Text>
                  <Text fontSize="sm" color="gray.500">
                    ({this.consumerGroup.members.length} members)
                  </Text>
                </HStack>
              ) : this.consumerGroupLoadFailed ? (
                <Text fontSize="lg" color="gray.500" title="Consumer group not yet available">
                  Initializing...
                </Text>
              ) : (
                <Text fontSize="lg" color="gray.500">
                  -
                </Text>
              )}
            </Box>

            <Box>
              <Text fontSize="sm" fontWeight="medium" color="gray.600">
                Consumer Lag
              </Text>
              {this.consumerGroup ? (
                <HStack spacing={2}>
                  <Text fontSize="lg" fontWeight="semibold">
                    <ShortNum value={this.consumerGroup.lagSum} tooltip={false} />
                  </Text>
                  <Text fontSize="sm" color="gray.500">
                    messages
                  </Text>
                </HStack>
              ) : (
                <Text fontSize="lg" color="gray.500">
                  -
                </Text>
              )}
            </Box>
          </HStack>
        </Box>

        <KnowledgeBaseEditTabs
          ref={this.editTabsRef}
          knowledgeBase={kb}
          isEditMode={this.isEditMode}
          onSave={this.handleUpdate}
          onCancel={this.handleCancelEdit}
          onFormChange={this.onFormChange}
        />
      </Box>
    );
  }

  render(): JSX.Element {
    if (this.loading) return DefaultSkeleton;

    return (
      <PageContent>
        <ToastContainer />

        <Box mb={4}>
          <RouterLink to="/knowledgebases">
            <Button variant="ghost" size="sm">
              ← Back to Knowledge Bases
            </Button>
          </RouterLink>
        </Box>

        {this.renderKnowledgeBaseDetails()}
      </PageContent>
    );
  }
}

export default KnowledgeBaseDetails;
