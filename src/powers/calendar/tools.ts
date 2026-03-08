import type { calendar_v3 } from "googleapis";
import * as googleCalendarClient from "../../core/googleCalendarClient.js";
import * as validation from "../../utils/validation.js";
import type * as powerTypes from "../types.js";

const DEFAULT_TIMEZONE = "America/New_York";
const DEFAULT_DURATION_MINUTES = 30;

type CalendarEventInput = {
  title: string;
  start: string;
  end: string;
  description?: string;
  location?: string;
  calendarId: string;
  timezone?: string;
};

function readRequiredString(args: powerTypes.ToolArgs, key: string): string {
  const value = args[key];
  if (!validation.isNonEmptyString(value)) {
    throw new Error(`'${key}' must be a non-empty string.`);
  }

  return value.trim();
}

function readOptionalString(args: powerTypes.ToolArgs, key: string): string | undefined {
  const value = args[key];
  if (value === undefined) {
    return undefined;
  }

  if (!validation.isString(value)) {
    throw new Error(`'${key}' must be a string.`);
  }

  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : undefined;
}

function isDateOnly(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isDateTimeWithoutTimezone(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(value);
}

function isDateTimeWithTimezone(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(Z|[+-]\d{2}:\d{2})$/.test(value);
}

function addMinutesToLocalDateTime(value: string, minutesToAdd: number): string {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) {
    throw new Error("Timed events must use ISO date-time values.");
  }

  const [, year, month, day, hour, minute, second] = match;
  const date = new Date(Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second ?? "0")
  ));

  date.setUTCMinutes(date.getUTCMinutes() + minutesToAdd);

  const nextYear = String(date.getUTCFullYear()).padStart(4, "0");
  const nextMonth = String(date.getUTCMonth() + 1).padStart(2, "0");
  const nextDay = String(date.getUTCDate()).padStart(2, "0");
  const nextHour = String(date.getUTCHours()).padStart(2, "0");
  const nextMinute = String(date.getUTCMinutes()).padStart(2, "0");
  const nextSecond = String(date.getUTCSeconds()).padStart(2, "0");

  return `${nextYear}-${nextMonth}-${nextDay}T${nextHour}:${nextMinute}:${nextSecond}`;
}

function addMinutesToOffsetDateTime(value: string, minutesToAdd: number): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Timed events must use valid ISO date-time values.");
  }

  date.setMinutes(date.getMinutes() + minutesToAdd);
  return date.toISOString();
}

function getDefaultEnd(start: string, timezone: string | undefined): string {
  if (isDateOnly(start)) {
    throw new Error("All-day events require an explicit 'end' date.");
  }

  if (isDateTimeWithTimezone(start)) {
    return addMinutesToOffsetDateTime(start, DEFAULT_DURATION_MINUTES);
  }

  if (isDateTimeWithoutTimezone(start)) {
    if (!timezone) {
      throw new Error("Timed events without a timezone offset require a timezone.");
    }

    return addMinutesToLocalDateTime(start, DEFAULT_DURATION_MINUTES);
  }

  throw new Error("Timed events must use ISO date-time values.");
}

function readCalendarEventInput(args: powerTypes.ToolArgs): CalendarEventInput {
  const title = readRequiredString(args, "title");
  const start = readRequiredString(args, "start");
  const providedEnd = readOptionalString(args, "end");
  const description = readOptionalString(args, "description");
  const location = readOptionalString(args, "location");
  const calendarId = googleCalendarClient.getGoogleCalendarId();
  const timezone = readOptionalString(args, "timezone") ?? DEFAULT_TIMEZONE;
  const end = providedEnd ?? getDefaultEnd(start, timezone);

  const startIsDateOnly = isDateOnly(start);
  const endIsDateOnly = isDateOnly(end);

  if (startIsDateOnly !== endIsDateOnly) {
    throw new Error("'start' and 'end' must both be date-only values or both be date-time values.");
  }

  if (startIsDateOnly && end <= start) {
    throw new Error("'end' must be after 'start'.");
  }

  if (!startIsDateOnly) {
    const startHasTimezone = isDateTimeWithTimezone(start);
    const endHasTimezone = isDateTimeWithTimezone(end);
    const startIsLocalDateTime = isDateTimeWithoutTimezone(start);
    const endIsLocalDateTime = isDateTimeWithoutTimezone(end);

    if ((!startHasTimezone && !startIsLocalDateTime) || (!endHasTimezone && !endIsLocalDateTime)) {
      throw new Error("Timed events must use ISO date-times like 2026-03-08T15:00:00-07:00, 2026-03-08T15:00:00Z, or 2026-03-08T15:00 with a timezone.");
    }

    if ((startHasTimezone && endIsLocalDateTime) || (endHasTimezone && startIsLocalDateTime)) {
      throw new Error("'start' and 'end' must either both include a timezone offset or both rely on the same timezone value.");
    }

    const parsedStart = Date.parse(startHasTimezone ? start : `${start}:00`);
    const parsedEnd = Date.parse(endHasTimezone ? end : `${end}:00`);
    if (Number.isNaN(parsedStart) || Number.isNaN(parsedEnd)) {
      throw new Error("'start' and 'end' must be valid ISO date-time values.");
    }

    if (parsedEnd <= parsedStart) {
      throw new Error("'end' must be after 'start'.");
    }
  }

  return {
    title,
    start,
    end,
    description,
    location,
    calendarId,
    timezone
  };
}

function buildEventDateTime(dateTime: string, timezone: string | undefined): calendar_v3.Schema$EventDateTime {
  if (isDateOnly(dateTime)) {
    return { date: dateTime };
  }

  if (isDateTimeWithTimezone(dateTime)) {
    return { dateTime };
  }

  return {
    dateTime: `${dateTime}:00`,
    timeZone: timezone
  };
}

async function createCalendarEvent(args: powerTypes.ToolArgs): Promise<string> {
  const input = readCalendarEventInput(args);
  const calendar = googleCalendarClient.getGoogleCalendarClient();

  const requestBody: calendar_v3.Schema$Event = {
    summary: input.title,
    description: input.description,
    location: input.location,
    start: buildEventDateTime(input.start, input.timezone),
    end: buildEventDateTime(input.end, input.timezone)
  };

  const response = await calendar.events.insert({
    calendarId: input.calendarId,
    requestBody
  });

  return JSON.stringify({
    calendarId: input.calendarId,
    eventId: response.data.id,
    summary: response.data.summary,
    htmlLink: response.data.htmlLink,
    start: response.data.start?.dateTime ?? response.data.start?.date,
    end: response.data.end?.dateTime ?? response.data.end?.date
  }, null, 2);
}

const calendarToolDefinitions: powerTypes.AgentToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "create_calendar_event",
      description: "Create a Google Calendar event on the authenticated user's calendar.",
      parameters: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "Event title or summary"
          },
          start: {
            type: "string",
            description: "Event start. Use YYYY-MM-DD for all-day events or an ISO date-time like 2026-03-08T15:00:00-07:00."
          },
          end: {
            type: "string",
            description: "Optional event end. Use YYYY-MM-DD for all-day events or an ISO date-time like 2026-03-08T16:00:00-07:00. If omitted for a timed event, the event defaults to 30 minutes."
          },
          description: {
            type: "string",
            description: "Optional event description"
          },
          location: {
            type: "string",
            description: "Optional event location"
          },
          timezone: {
            type: "string",
            description: "Optional IANA timezone like America/New_York. Defaults to America/New_York when a time is provided without an offset."
          },
        },
        required: ["title", "start"],
        additionalProperties: false
      }
    }
  }
];

const calendarToolExecutors: Record<string, powerTypes.ToolExecutor> = {
  create_calendar_event: async (args) => createCalendarEvent(args)
};

export const CALENDAR_POWER: powerTypes.AgentPower = {
  id: "calendar",
  name: "Calendar Power",
  description: "Create Google Calendar events using env-configured OAuth credentials.",
  routingDescription: "creating calendar events, adding tasks to Google Calendar, scheduling meetings, reminders, and appointments",
  systemPrompt: [
    "Calendar rules:",
    "- Use the calendar tool when the user wants to create or schedule a Google Calendar event.",
    "- The calendarId comes from the GOOGLE_CALENDAR_ID environment variable. Do not ask the user for calendarId unless they are configuring the app.",
    "- Default to America/New_York when the user does not specify a timezone.",
    "- If the user gives a timed event without a duration or end time, default the duration to 30 minutes.",
    "- Use YYYY-MM-DD for all-day events.",
    "- If a time is ambiguous, resolve it before creating the event."
  ].join("\n"),
  toolDefinitions: calendarToolDefinitions,
  toolExecutors: calendarToolExecutors
};