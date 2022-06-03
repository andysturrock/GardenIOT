import SerializedRecurrenceRule from './serialized-recurrence-rule';
import SerializedRelay from './serialized-relay';

interface SerializedWateringJob {
  _rule : SerializedRecurrenceRule;
  _duration: number;
  _relays : SerializedRelay[];
}

export default SerializedWateringJob;
