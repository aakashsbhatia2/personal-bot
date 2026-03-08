# Run The Project

1. Install dependencies:

```bash
npm install
```

2. Link the CLI locally:

```bash
npm link
```

3. Create a `.env` file in the project root:

```env
OPENAI_API_KEY=your_api_key_here
OPENAI_MODEL=your-open-ai-model
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_REFRESH_TOKEN=your-google-refresh-token
GOOGLE_CALENDAR_ID=your-calendar-id
```

4. Start a new session:

```bash
agent start -t "Your project context"
```

5. Send a task to the active session:

```bash
agent task "Your instruction"
```

## Powers

### Calendar Power

Operations:

- Create Google Calendar events
    - Schedule timed events
    - Schedule all-day events
    - Set optional event description
    - Set optional event location
    - Default timed events to America/New_York when no timezone is provided
    - Default timed events to 30 minutes when no end time is provided

### Time Power

Operations:

- Get the current local time
- Get the current local date
- Get the current local timezone

### Todo Power

Operations:

- Create todos
- List todos
- Complete todos
- Delete todos

## Google Calendar

The calendar power uses the official Google Calendar API client and reads OAuth credentials directly from environment variables. The app does not generate or store refresh tokens for you.

Required environment variables:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REFRESH_TOKEN`
- `GOOGLE_CALENDAR_ID`
