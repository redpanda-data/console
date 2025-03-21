import { HStack, Icon, Text } from '@redpanda-data/ui';
import { Pipeline_State } from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import type { IconType } from 'react-icons';
import { FaRegStopCircle } from 'react-icons/fa';
import { MdCheck, MdDone, MdError, MdOutlineQuestionMark, MdRefresh } from 'react-icons/md';

interface AgentStateDisplayValueProps {
  state?: Pipeline_State;
}

const AgentStateDisplay = (icon: IconType, text: string, color?: string) => (
  <HStack spacing={2}>
    <Icon as={icon} color={color} boxSize={4} />
    <Text>{text}</Text>
  </HStack>
);

export const AgentStateDisplayValue = ({ state }: AgentStateDisplayValueProps) => {
  switch (state) {
    case Pipeline_State.UNSPECIFIED: {
      return AgentStateDisplay(MdOutlineQuestionMark, 'Unknown', 'red');
    }
    case Pipeline_State.STARTING: {
      return AgentStateDisplay(MdRefresh, 'Starting', 'blue');
    }
    case Pipeline_State.RUNNING: {
      return AgentStateDisplay(MdCheck, 'Running', 'green');
    }
    case Pipeline_State.STOPPING: {
      return AgentStateDisplay(MdRefresh, 'Stopping', 'blue');
    }
    case Pipeline_State.STOPPED: {
      return AgentStateDisplay(FaRegStopCircle, 'Stopped');
    }
    case Pipeline_State.ERROR: {
      return AgentStateDisplay(MdError, 'Error', 'red');
    }
    case Pipeline_State.COMPLETED: {
      return AgentStateDisplay(MdDone, 'Completed', 'green');
    }
  }
};
