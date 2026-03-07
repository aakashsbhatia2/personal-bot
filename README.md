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
```

4. Start a new session:

```bash
agent start -t "Your project context"
```

5. Send a task to the active session:

```bash
agent task "Your instruction"
```
