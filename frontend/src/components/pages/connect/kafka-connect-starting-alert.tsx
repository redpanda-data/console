import { WarningIcon } from 'components/icons';
import { Alert, AlertDescription, AlertTitle } from 'components/redpanda-ui/components/alert';
import { describeKafkaConnectPhase, type KafkaConnectStarting } from 'utils/kafka-connect-starting';

export type KafkaConnectStartingState = {
  info: KafkaConnectStarting;
  secondsRemaining: number;
};

/** Text-only variant for stores that only carry a message. */
export const KafkaConnectStartingNotice = ({ message }: { message: string }) => (
  <Alert icon={<WarningIcon />} variant="warning">
    <AlertTitle>Kafka Connect is starting</AlertTitle>
    <AlertDescription>{message}</AlertDescription>
  </Alert>
);

/**
 * Shown while a Kafka Connect request waits for the workers to boot after they
 * were scaled to zero. The caller retries on its own when the countdown ends.
 */
export const KafkaConnectStartingAlert = ({ state }: { state: KafkaConnectStartingState }) => {
  const { info, secondsRemaining } = state;
  const estimate =
    info.estimatedWaitSeconds && info.estimatedWaitSeconds > 60
      ? ` This usually takes about ${Math.round(info.estimatedWaitSeconds / 60)} min.`
      : '';
  return (
    <Alert icon={<WarningIcon />} variant="warning">
      <AlertTitle>Kafka Connect is starting</AlertTitle>
      <AlertDescription>
        Kafka Connect was scaled to zero while idle and is {describeKafkaConnectPhase(info.phase)}.{estimate} Retrying
        in {secondsRemaining}s…
      </AlertDescription>
    </Alert>
  );
};
