import { InfoCircleOutlined } from '@ant-design/icons';
import { PencilIcon } from '@heroicons/react/solid';
import { AdjustmentsIcon } from '@heroicons/react/outline';
import { Alert, AlertDescription, AlertIcon, Box, Button, Flex, Grid, GridItem, Icon, Input, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader, ModalOverlay,
    PasswordInput, Popover, RadioGroup, SearchField, Text, Tooltip, useToast } from '@redpanda-data/ui';
import { Observer, observer, useLocalObservable } from 'mobx-react';
import { FC } from 'react';
import { ConfigEntryExtended } from '../../../state/restInterfaces';
import { formatConfigValue } from '../../../utils/formatters/ConfigValueFormatter';
import { DataSizeSelect, DurationSelect, NumInput, RatioInput } from './CreateTopicModal/CreateTopicModal';
import './TopicConfiguration.scss';
import { api } from '../../../state/backendApi';
import { isServerless } from '../../../config';
import { SingleSelect } from '../../misc/Select';
import { Label } from '../../../utils/tsxUtils';


type ConfigurationEditorProps = {
    targetTopic: string | null, // topic name, or null if default configs
    entries: ConfigEntryExtended[],
    onForceRefresh: () => void,
}

const ConfigurationEditor: FC<ConfigurationEditorProps> = observer((props) => {
    const toast = useToast()
    const $state = useLocalObservable<{
        isEditing: boolean;
        filter?: string;
        initialValueType?: 'default' | 'custom';
        modalValueType: 'default' | 'custom';
        modalError: string | null,
        editedEntry: ConfigEntryExtended | null;
    }>(() => ({
        isEditing: false,
        modalValueType: 'default',
        modalError: null,
        editedEntry: null,
    }))

    const editConfig = (configEntry: ConfigEntryExtended) => {
        configEntry.currentValue = configEntry.value;
        $state.initialValueType = configEntry.isExplicitlySet ? 'custom' : 'default';

        $state.modalValueType = $state.initialValueType;
        $state.editedEntry = configEntry;
    }

    const topic = props.targetTopic;
    const hasEditPermissions = topic
        ? api.topicPermissions.get(topic)?.canEditTopicConfig ?? true
        : true;

    let entries = props.entries;
    const filter = $state.filter;
    if (filter)
        entries = entries.filter(x => x.name.includes(filter) || (x.value ?? '').includes(filter));

    const entryOrder = {
        'retention': -3,
        'cleanup': -2,
    };

    entries = entries.slice().sort((a, b) => {
        for (const [e, order] of Object.entries(entryOrder)) {
            if (a.name.includes(e) && !b.name.includes(e)) return order;
            if (b.name.includes(e) && !a.name.includes(e)) return -order;
        }
        return 0;
    });

    const categories = entries.groupInto(x => x.category);
    for (const e of categories) if (!e.key) e.key = 'Other';


    return (
        <Box pt={4}>
            <Modal isOpen={$state.editedEntry !== null} onClose={() => $state.editedEntry = null}>
                <ModalOverlay />
                {$state.editedEntry !== null &&
                    <ModalContent minW="2xl">
                        <ModalHeader><Icon as={AdjustmentsIcon}/> {'Edit ' + $state.editedEntry.name}</ModalHeader>
                        <ModalBody>
                            <Observer>{() => {
                                const isCustom = $state.modalValueType == 'custom';

                                if ($state.editedEntry === null) {
                                    return null
                                }

                                const configEntry = $state.editedEntry
                                const defaultEntry = $state.editedEntry.synonyms?.last();
                                const defaultValue = defaultEntry?.value ?? $state.editedEntry.value;
                                const defaultSource = defaultEntry?.source ?? $state.editedEntry.source;
                                const friendlyDefault = formatConfigValue($state.editedEntry.name, defaultValue, 'friendly');


                                return (
                                    <div>
                                        <p>Edit <code>{configEntry.name}</code> configuration for topic <code>{props.targetTopic}</code>.</p>
                                        <Alert
                                            bg="blue.50"
                                            status="info"
                                            variant="left-accent"
                                            my={4}
                                        >
                                            <AlertIcon />
                                            <AlertDescription>
                                                {configEntry.documentation}
                                            </AlertDescription>
                                        </Alert>

                                        <Label text="Value">
                                            <RadioGroup name="valueType" value={$state.modalValueType} onChange={value => {
                                                $state.modalValueType = value;
                                            }} options={[
                                                {
                                                    value: 'default',
                                                    label: 'Default'
                                                },
                                                {
                                                    value: 'custom',
                                                    label: 'Custom'
                                                }
                                            ]} />
                                        </Label>

                                        <Flex flexDirection="column" my={8}>
                                            {$state.modalValueType === 'default' && <>
                                                <Text fontWeight="bold">{friendlyDefault}</Text>
                                                <Text>Inherited from {defaultSource}</Text>
                                            </>}

                                            {$state.modalValueType === 'custom' && <>
                                                <Text fontWeight="bold">Set at topic configuration</Text>
                                                <Box maxWidth={300}>
                                                    <ConfigEntryEditor
                                                        className={'configEntryEditor ' + (isCustom ? '' : 'disabled')}
                                                        entry={configEntry}/>
                                                </Box>
                                            </>}

                                            {$state.modalError && <Alert status="error" style={{margin: '1em 0'}}>
                                                <AlertIcon/>
                                                {$state.modalError}
                                            </Alert>}
                                        </Flex>
                                    </div>
                                )
                            }}</Observer>
                        </ModalBody>
                        <ModalFooter>
                            <Button variant="ghost" onClick={() => {
                                $state.editedEntry = null
                            }}>Cancel</Button>
                            <Button variant="solid" onClick={async () => {
                                if ($state.editedEntry === null) {
                                    return null
                                }

                                // When do we need to apply?
                                // -> When the "type" changed (from default to custom or vice-versa)
                                // -> When type is "custom" and "currentValue" changed
                                // So this excludes the case where value was changed, but the type was "default" before and after
                                let needToApply = false;
                                if ($state.modalValueType != $state.initialValueType)
                                    needToApply = true;
                                if ($state.modalValueType == 'custom' && $state.editedEntry.value != $state.editedEntry.currentValue)
                                    needToApply = true;

                                if (!needToApply) {
                                    $state.editedEntry = null
                                    return;
                                }

                                const operation = $state.modalValueType == 'custom'
                                    ? 'SET'
                                    : 'DELETE';

                                try {
                                    await api.changeTopicConfig(props.targetTopic, [
                                        {
                                            key: $state.editedEntry.name,
                                            op: operation,
                                            value: (operation == 'SET')
                                                ? String($state.editedEntry.currentValue)
                                                : undefined,
                                        }
                                    ]);
                                    toast({
                                        status: 'success',
                                        description: <span>Successfully updated config <code>{$state.editedEntry.name}</code></span>,
                                    })
                                    $state.editedEntry = null
                                } catch (err) {
                                    console.error('error while applying config change', {err, configEntry: $state.editedEntry});
                                    $state.modalError = (err instanceof Error)
                                        ? err.message
                                        : String(err);
                                    // we must to throw an error to keep the modal open
                                    throw err;
                                }


                                props.onForceRefresh()
                            }}>Save changes</Button>
                        </ModalFooter>
                    </ModalContent>
                }
            </Modal>
            <div className="configGroupTable">
                <SearchField searchText={$state.filter || ''} placeholderText="Filter" setSearchText={value => ($state.filter = value)} icon="filter"/>
                {categories.map(x => (
                    <ConfigGroup key={x.key} groupName={x.key} entries={x.items} onEditEntry={editConfig} hasEditPermissions={hasEditPermissions}/>
                ))}
            </div>
        </Box>
    );
})

export default ConfigurationEditor


const ConfigGroup = observer((p: { groupName?: string; onEditEntry: (configEntry: ConfigEntryExtended) => void; entries: ConfigEntryExtended[]; hasEditPermissions: boolean }) => {
    return (
        <>
            <div className="configGroupSpacer"/>
            {p.groupName && <div className="configGroupTitle">{p.groupName}</div>}
            {p.entries.map(e => (
                <ConfigEntry key={e.name} entry={e} onEditEntry={p.onEditEntry} hasEditPermissions={p.hasEditPermissions}/>
            ))}
        </>
    );
});

const ConfigEntry = observer((p: { onEditEntry: (configEntry: ConfigEntryExtended) => void; entry: ConfigEntryExtended; hasEditPermissions: boolean }) => {
    const {canEdit, reason: nonEdittableReason} = isTopicConfigEdittable(p.entry, p.hasEditPermissions);

    const entry = p.entry;
    const friendlyValue = formatConfigValue(entry.name, entry.value, 'friendly');

    return (
        <>
            <span className="configName">{p.entry.name}</span>

            <span className="configValue">{friendlyValue}</span>

            <span className="isEditted">{entry.isExplicitlySet && 'Custom'}</span>

            <span className="spacer"></span>

            <span className="configButtons">
                <Tooltip label={nonEdittableReason} placement="left" isDisabled={canEdit} hasArrow>
                    <span
                        className={'btnEdit' + (canEdit ? '' : ' disabled')}
                        onClick={() => {
                            if (canEdit) p.onEditEntry(p.entry);
                        }}
                    >
                        <Icon as={PencilIcon}/>
                    </span>
                </Tooltip>
                {entry.documentation && (
                    <Popover
                        hideCloseButton
                        size="lg"
                        content={
                            <Grid templateColumns="1fr" gap={4} w="fit-content">
                                <GridItem>
                                    <strong>{entry.name}</strong>
                                    <br/>
                                    {entry.documentation}
                                </GridItem>
                                <GridItem>
                                    <Grid templateColumns="25% 1fr" gap={2}>
                                        <GridItem>
                                            <strong>Value</strong>
                                        </GridItem>
                                        <GridItem>
                                            <span>{friendlyValue}</span>
                                        </GridItem>
                                        <GridItem>
                                            <strong>Source</strong>
                                        </GridItem>
                                        <GridItem>
                                            <div>
                                                <code>{entry.source}</code>
                                            </div>
                                            <Text fontSize="sm">{getConfigSourceExplanation(entry.source)}</Text>
                                        </GridItem>
                                    </Grid>
                                </GridItem>
                            </Grid>
                        }
                    >
                        <Icon as={InfoCircleOutlined}/>
                    </Popover>
                )}
            </span>
        </>
    );
});

function isTopicConfigEdittable(entry: ConfigEntryExtended, hasEditPermissions: boolean): { canEdit: boolean; reason?: string } {
    if (!hasEditPermissions) return {canEdit: false, reason: 'You don\'t have permissions to change topic configuration entries'};

    if (isServerless()) {
        const edittableEntries = ['retention.ms', 'retention.bytes'];

        if (edittableEntries.includes(entry.name)) {
            return {canEdit: true};
        }

        return {canEdit: false, reason: 'This configuration is not editable on Serverless clusters'};
    }

    return {canEdit: true};
}


export const ConfigEntryEditor = observer((p: {
    entry: ConfigEntryExtended;
    className?: string;
}) => {
    const entry = p.entry;
    switch (entry.frontendFormat) {
        case 'BOOLEAN':
            return <SingleSelect
                options={[
                    {value: 'false', label: 'False'},
                    {value: 'true', label: 'True'},
                ]}
                value={entry.currentValue}
                onChange={c => entry.currentValue = c}
            />

        case 'SELECT':
            return <SingleSelect
                value={entry.currentValue}
                onChange={e => entry.currentValue = e} className={p.className}
                options={entry.enumValues?.map(value => ({
                    value,
                    label: value
                })) ?? []}
            />

        case 'BYTE_SIZE':
            return <DataSizeSelect
                allowInfinite={true}
                valueBytes={Number(entry.currentValue ?? 0)}
                onChange={e => entry.currentValue = Math.round(e)}
                className={p.className}
            />
        case 'DURATION':
            return <DurationSelect
                allowInfinite={true}
                valueMilliseconds={Number(entry.currentValue ?? 0)}
                onChange={e => entry.currentValue = Math.round(e)}
                className={p.className}
            />

        case 'PASSWORD':
            return <PasswordInput value={entry.currentValue ?? ''} onChange={x => entry.currentValue = x.target.value}/>

        case 'RATIO':
            return <RatioInput value={Number(entry.currentValue)} onChange={x => entry.currentValue = x}/>

        case 'INTEGER':
            return <NumInput value={Number(entry.currentValue)} onChange={e => entry.currentValue = Math.round(e ?? 0)} className={p.className}/>

        case 'DECIMAL':
            return <NumInput value={Number(entry.currentValue)} onChange={e => entry.currentValue = e} className={p.className}/>

        case 'STRING':
        default:
            return <Input value={String(entry.currentValue)} onChange={e => entry.currentValue = e.target.value} />
    }
});

function getConfigSourceExplanation(source: string) {
    switch (source) {
        case 'DEFAULT_CONFIG':
            return 'This default value is used if the setting is not overwritten.';

        case 'DYNAMIC_BROKER_CONFIG':
        case 'DYNAMIC_BROKER_LOGGER_CONFIG':
        case 'DYNAMIC_DEFAULT_BROKER_CONFIG':
            return 'Set at broker level';

        case 'DYNAMIC_TOPIC_CONFIG':
            return 'Set for this specific topic';

        case 'STATIC_BROKER_CONFIG':
            return 'Set on the broker by either a config file or environment variable';

        default:
            return '';
    }
}
