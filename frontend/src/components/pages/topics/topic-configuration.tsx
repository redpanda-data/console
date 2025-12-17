import { PencilIcon } from '@heroicons/react/solid';
import {
  Alert,
  AlertIcon,
  Box,
  Button,
  Flex,
  FormField,
  Icon,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  PasswordInput,
  Popover,
  RadioGroup,
  SearchField,
  Text,
  Tooltip,
  useToast,
} from '@redpanda-data/ui';
import { observer, useLocalObservable } from 'mobx-react';
import type { FC } from 'react';
import { useState } from 'react';
import { Controller, type SubmitHandler, useForm } from 'react-hook-form';

import { DataSizeSelect, DurationSelect, NumInput, RatioInput } from './CreateTopicModal/create-topic-modal';
import type { ConfigEntryExtended } from '../../../state/rest-interfaces';
import {
  entryHasInfiniteValue,
  formatConfigValue,
  getInfiniteValueForEntry,
} from '../../../utils/formatters/config-value-formatter';
import './TopicConfiguration.scss';
import { MdInfoOutline } from 'react-icons/md';

import { isServerless } from '../../../config';
import { api } from '../../../state/backend-api';
import { SingleSelect } from '../../misc/select';

type ConfigurationEditorProps = {
  targetTopic: string; // topic name, or null if default configs
  entries: ConfigEntryExtended[];
  onForceRefresh: () => void;
};

type Inputs = {
  valueType: 'default' | 'infinite' | 'custom';
  customValue: string | number | undefined | null;
};

const ConfigEditorForm: FC<{
  editedEntry: ConfigEntryExtended;
  onClose: () => void;
  onSuccess: () => void;
  targetTopic: string;
}> = ({ editedEntry, onClose, targetTopic, onSuccess }) => {
  const toast = useToast();
  const [globalError, setGlobalError] = useState<string | null>(null);

  const defaultValueType = (() => {
    if (!editedEntry.isExplicitlySet) {
      return 'default';
    }
    return entryHasInfiniteValue(editedEntry) ? 'infinite' : 'custom';
  })();
  const defaultCustomValue =
    editedEntry.isExplicitlySet && !entryHasInfiniteValue(editedEntry) ? editedEntry.value : '';

  const {
    control,
    handleSubmit,
    formState: { isSubmitting },
    watch,
  } = useForm<Inputs>({
    defaultValues: {
      valueType: defaultValueType,
      customValue: defaultCustomValue,
    },
  });

  const hasInfiniteValue = editedEntry.frontendFormat && ['BYTE_SIZE', 'DURATION'].includes(editedEntry.frontendFormat);
  const valueTypeOptions: Array<{
    label: string;
    value: Inputs['valueType'];
  }> = [];
  valueTypeOptions.push({
    label: 'Default',
    value: 'default',
  });
  if (hasInfiniteValue) {
    valueTypeOptions.push({
      label: 'Infinite',
      value: 'infinite',
    });
  }
  valueTypeOptions.push({
    label: 'Custom',
    value: 'custom',
  });

  const onSubmit: SubmitHandler<Inputs> = async ({ valueType: submittedValueType, customValue }) => {
    const operation = submittedValueType === 'infinite' || submittedValueType === 'custom' ? 'SET' : 'DELETE';

    let value: number | string | undefined | null;
    if (submittedValueType === 'infinite') {
      value = getInfiniteValueForEntry(editedEntry);
    } else if (submittedValueType === 'custom') {
      value = customValue;
    }

    try {
      await api.changeTopicConfig(targetTopic, [
        {
          key: editedEntry.name,
          op: operation,
          value: operation === 'SET' ? String(value) : undefined,
        },
      ]);
      toast({
        status: 'success',
        description: (
          <span>
            Successfully updated config <code>{editedEntry.name}</code>
          </span>
        ),
      });
      onSuccess();
      onClose();
    } catch (err) {
      // biome-ignore lint/suspicious/noConsole: intentional console usage
      console.error('error while applying config change', { err, configEntry: editedEntry });
      setGlobalError(err instanceof Error ? err.message : String(err));
    }
  };

  const valueType = watch('valueType');

  const SOURCE_PRIORITY_ORDER = [
    'DYNAMIC_TOPIC_CONFIG',
    'DYNAMIC_BROKER_CONFIG',
    'DYNAMIC_DEFAULT_BROKER_CONFIG',
    'STATIC_BROKER_CONFIG',
    'DEFAULT_CONFIG',
  ];

  const defaultConfigSynonym = editedEntry.synonyms
    ?.filter(({ source }) => source !== 'DYNAMIC_TOPIC_CONFIG')
    .sort((a, b) => SOURCE_PRIORITY_ORDER.indexOf(a.source) - SOURCE_PRIORITY_ORDER.indexOf(b.source))[0];

  return (
    <Modal isOpen onClose={onClose}>
      <form onSubmit={handleSubmit(onSubmit)}>
        <ModalOverlay />
        <ModalContent minW="2xl">
          <ModalHeader>{`Edit ${editedEntry.name}`}</ModalHeader>
          <ModalBody>
            <Text mb={6}>{editedEntry.documentation}</Text>

            <Flex flexDirection="column" gap={4}>
              <FormField label={editedEntry.name}>
                <Controller
                  control={control}
                  name="valueType"
                  render={({ field: { onChange, value } }) => (
                    <RadioGroup name="valueType" onChange={onChange} options={valueTypeOptions} value={value} />
                  )}
                />
              </FormField>
              {valueType === 'custom' && (
                <FormField label={`Set a custom ${editedEntry.name} value for this topic`}>
                  <Box maxW="fit-content">
                    <Controller
                      control={control}
                      name="customValue"
                      render={({ field: { onChange, value } }) => (
                        <ConfigEntryEditorController entry={editedEntry} onChange={onChange} value={value} />
                      )}
                    />
                  </Box>
                </FormField>
              )}
              {/*It's not possible to show default value until we get it always from the BE.*/}
              {/*Currently we only retrieve the current value and not default if it's set to custom/infinite*/}
              {valueType === 'default' && defaultConfigSynonym && (
                <Box>
                  The default value is{' '}
                  <Text display="inline" fontWeight="bold">
                    {/*{JSON.stringify(editedEntry)}*/}
                    {formatConfigValue(editedEntry.name, defaultConfigSynonym.value, 'friendly')}
                  </Text>
                  . This is inherited from {defaultConfigSynonym.source}.
                </Box>
              )}
            </Flex>
            {globalError && (
              <Alert my={2} status="error">
                <AlertIcon />
                {globalError}
              </Alert>
            )}
          </ModalBody>
          <ModalFooter display="flex" gap={2}>
            <Button
              onClick={() => {
                onClose();
              }}
              variant="ghost"
            >
              Cancel
            </Button>
            <Button isDisabled={isSubmitting} type="submit" variant="solid">
              Save changes
            </Button>
          </ModalFooter>
        </ModalContent>
      </form>
    </Modal>
  );
};

const ConfigurationEditor: FC<ConfigurationEditorProps> = observer((props) => {
  const $state = useLocalObservable<{
    filter?: string;
    editedEntry: ConfigEntryExtended | null;
  }>(() => ({
    filter: '',
    editedEntry: null,
  }));

  const editConfig = (configEntry: ConfigEntryExtended) => {
    $state.editedEntry = configEntry;
  };

  const topic = props.targetTopic;
  const hasEditPermissions = topic ? (api.topicPermissions.get(topic)?.canEditTopicConfig ?? true) : true;

  let entries = props.entries;
  const filter = $state.filter;
  if (filter) {
    entries = entries.filter((x) => x.name.includes(filter) || (x.value ?? '').includes(filter));
  }

  const entryOrder = {
    retention: -3,
    cleanup: -2,
  };

  entries = entries.slice().sort((a, b) => {
    for (const [e, order] of Object.entries(entryOrder)) {
      if (a.name.includes(e) && !b.name.includes(e)) {
        return order;
      }
      if (b.name.includes(e) && !a.name.includes(e)) {
        return -order;
      }
    }
    return 0;
  });

  const categories = entries.groupInto((x) => x.category);
  for (const e of categories) {
    if (!e.key) {
      e.key = 'Other';
    }
  }

  const displayOrder = [
    'Retention',
    'Compaction',
    'Replication',
    'Tiered Storage',
    'Write Caching',
    'Iceberg',
    'Schema Registry and Validation',
    'Message Handling',
    'Compression',
    'Storage Internals',
    'Other',
  ];

  categories.sort((a, b) => displayOrder.indexOf(a.key ?? '') - displayOrder.indexOf(b.key ?? ''));

  return (
    <Box pt={4}>
      {$state.editedEntry !== null && (
        <ConfigEditorForm
          editedEntry={$state.editedEntry}
          onClose={() => ($state.editedEntry = null)}
          onSuccess={() => {
            props.onForceRefresh();
          }}
          targetTopic={props.targetTopic}
        />
      )}
      <div className="configGroupTable" data-testid="config-group-table">
        <SearchField
          icon="filter"
          placeholderText="Filter"
          searchText={$state.filter || ''}
          setSearchText={(value) => ($state.filter = value)}
        />
        {categories.map((x) => (
          <ConfigGroup
            entries={x.items}
            groupName={x.key}
            hasEditPermissions={hasEditPermissions}
            key={x.key}
            onEditEntry={editConfig}
          />
        ))}
      </div>
    </Box>
  );
});

export default ConfigurationEditor;

const ConfigGroup = observer(
  (p: {
    groupName?: string;
    onEditEntry: (configEntry: ConfigEntryExtended) => void;
    entries: ConfigEntryExtended[];
    hasEditPermissions: boolean;
  }) => (
    <>
      <div className="configGroupSpacer" />
      {p.groupName && <div className="configGroupTitle">{p.groupName}</div>}
      {p.entries.map((e) => (
        <ConfigEntryComponent
          entry={e}
          hasEditPermissions={p.hasEditPermissions}
          key={e.name}
          onEditEntry={p.onEditEntry}
        />
      ))}
    </>
  )
);

const ConfigEntryComponent = observer(
  (p: {
    onEditEntry: (configEntry: ConfigEntryExtended) => void;
    entry: ConfigEntryExtended;
    hasEditPermissions: boolean;
  }) => {
    const { canEdit, reason: nonEdittableReason } = isTopicConfigEdittable(p.entry, p.hasEditPermissions);

    const entry = p.entry;
    const friendlyValue = formatConfigValue(entry.name, entry.value, 'friendly');

    return (
      <>
        <Flex direction="column">
          <Text fontWeight="600">{p.entry.name}</Text>
        </Flex>

        <Text>{friendlyValue}</Text>

        <span className="isEditted">{entry.isExplicitlySet && 'Custom'}</span>

        <span className="configButtons">
          <Tooltip hasArrow isDisabled={canEdit} label={nonEdittableReason} placement="left">
            <button
              className={`btnEdit${canEdit ? '' : 'disabled'}`}
              onClick={() => {
                if (canEdit) {
                  p.onEditEntry(p.entry);
                }
              }}
              type="button"
            >
              <Icon as={PencilIcon} />
            </button>
          </Tooltip>
          {entry.documentation && (
            <Popover
              content={
                <Flex flexDirection="column" gap={2}>
                  <Text fontSize="lg" fontWeight="bold">
                    {entry.name}
                  </Text>
                  <Text fontSize="sm">{entry.documentation}</Text>
                  <Text fontSize="sm">{getConfigDescription(entry.source)}</Text>
                </Flex>
              }
              hideCloseButton
              size="lg"
            >
              <Box>
                <Icon as={MdInfoOutline} />
              </Box>
            </Popover>
          )}
        </span>
      </>
    );
  }
);

function isTopicConfigEdittable(
  entry: ConfigEntryExtended,
  hasEditPermissions: boolean
): { canEdit: boolean; reason?: string } {
  if (!hasEditPermissions) {
    return { canEdit: false, reason: "You don't have permissions to change topic configuration entries" };
  }

  if (isServerless()) {
    const edittableEntries = [
      'retention.ms',
      'retention.bytes',
      'cleanup.policy',
      'write.caching',
      'max.message.bytes',
      'unclean.leader.election.enable',
      'min.insync.replicas',
    ];

    if (edittableEntries.includes(entry.name)) {
      return { canEdit: true };
    }

    return { canEdit: false, reason: 'This configuration is not editable on Serverless clusters' };
  }

  return { canEdit: true };
}

export const ConfigEntryEditorController = <T extends string | number>(p: {
  entry: ConfigEntryExtended;
  value: T;
  onChange: (e: T) => void;
  className?: string;
}) => {
  const { entry, value, onChange } = p;
  switch (entry.frontendFormat) {
    case 'BOOLEAN':
      return (
        <SingleSelect<T>
          onChange={onChange}
          options={[
            { value: 'false' as T, label: 'False' },
            { value: 'true' as T, label: 'True' },
          ]}
          value={value}
        />
      );

    case 'SELECT':
      return (
        <SingleSelect
          className={p.className}
          onChange={onChange}
          options={
            entry.enumValues?.map((enumValue) => ({
              value: enumValue as T,
              label: enumValue,
            })) ?? []
          }
          value={value}
        />
      );

    case 'BYTE_SIZE':
      return (
        <DataSizeSelect
          allowInfinite={false}
          onChange={(e) => onChange(Math.round(e) as T)}
          valueBytes={Number(value ?? 0)}
        />
      );
    case 'DURATION':
      return (
        <DurationSelect
          allowInfinite={false}
          onChange={(e) => onChange(Math.round(e) as T)}
          valueMilliseconds={Number(value ?? 0)}
        />
      );

    case 'PASSWORD':
      return <PasswordInput onChange={(x) => onChange(x.target.value as T)} value={value ?? ''} />;

    case 'RATIO':
      return <RatioInput onChange={(x) => onChange(x as T)} value={Number(value || entry.value)} />;

    case 'INTEGER':
      return <NumInput onChange={(e) => onChange(Math.round(e ?? 0) as T)} value={Number(value)} />;

    case 'DECIMAL':
      return <NumInput onChange={(e) => onChange(e as T)} value={Number(value)} />;
    default:
      return <Input onChange={(e) => onChange(e.target.value as T)} value={String(value)} />;
  }
};

function getConfigDescription(source: string): string {
  switch (source) {
    case 'DEFAULT_CONFIG':
      return 'Inherited from DEFAULT_CONFIG';
    case 'DYNAMIC_TOPIC_CONFIG':
      return 'This is a custom setting for this topic';
    case 'DYNAMIC_BROKER_CONFIG':
    case 'STATIC_BROKER_CONFIG':
      return 'This is a custom setting set on the BROKER_CONFIG level.';
    default:
      return '';
  }
}
