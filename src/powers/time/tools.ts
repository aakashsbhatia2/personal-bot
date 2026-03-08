import type * as powerTypes from "../types.js";

function getCurrentDateTime(): Date {
  return new Date();
}

function formatDateTime(date: Date, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(undefined, options).format(date);
}

const timeToolDefinitions: powerTypes.AgentToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "get_current_time",
      description: "Get the current local time.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_current_date",
      description: "Get the current local date.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_timezone",
      description: "Get the current local timezone.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
        additionalProperties: false
      }
    }
  }
];

const timeToolExecutors: Record<string, powerTypes.ToolExecutor> = {
  get_current_time: async () => {
    const now = getCurrentDateTime();

    return JSON.stringify({
      time: formatDateTime(now, {
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
        timeZoneName: "short"
      })
    }, null, 2);
  },
  get_current_date: async () => {
    const now = getCurrentDateTime();

    return JSON.stringify({
      date: formatDateTime(now, {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric"
      })
    }, null, 2);
  },
  get_timezone: async () => {
    return JSON.stringify({
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
    }, null, 2);
  }
};

export const TIME_POWER: powerTypes.AgentPower = {
  name: "Time Power",
  description: "Answer current local time, date, and timezone questions.",
  toolDefinitions: timeToolDefinitions,
  toolExecutors: timeToolExecutors
};
