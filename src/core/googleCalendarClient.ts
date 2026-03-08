import { google, type calendar_v3 } from "googleapis";

function readRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function getGoogleCalendarId(): string {
  return readRequiredEnv("GOOGLE_CALENDAR_ID");
}

export function getGoogleCalendarClient(): calendar_v3.Calendar {
  const oauth2Client = new google.auth.OAuth2(
    readRequiredEnv("GOOGLE_CLIENT_ID"),
    readRequiredEnv("GOOGLE_CLIENT_SECRET")
  );

  oauth2Client.setCredentials({
    refresh_token: readRequiredEnv("GOOGLE_REFRESH_TOKEN")
  });

  return google.calendar({
    version: "v3",
    auth: oauth2Client
  });
}