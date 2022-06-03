import { RecurrenceSegment, Timezone } from 'node-schedule';

interface SerializedRecurrenceRule {

  year?: RecurrenceSegment,
  month?: RecurrenceSegment,
  date?: RecurrenceSegment,
  dayOfWeek?: RecurrenceSegment,
  hour?: RecurrenceSegment,
  minute?: RecurrenceSegment,
  second?: RecurrenceSegment,
  tz?: Timezone,
}

export default SerializedRecurrenceRule;
