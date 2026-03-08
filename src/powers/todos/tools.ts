import fs from "fs";
import path from "path";
import * as openAIClient from "../../core/openaiClient.js";
import * as sessionManager from "../../sessions/sessionManager.js";
import * as validation from "../../utils/validation.js";
import type * as powerTypes from "../types.js";

type TodoStatus = "open" | "completed";

type TodoItem = {
  title: string;
  status: TodoStatus;
  createdAt: string;
  completedAt?: string;
};

function getTodoFilePath(): string {
  return path.join(sessionManager.getActiveSessionDir(), "todos.json");
}

function readTodos(): TodoItem[] {
  const todoFilePath = getTodoFilePath();

  if (!fs.existsSync(todoFilePath)) {
    return [];
  }

  const parsedJson = JSON.parse(fs.readFileSync(todoFilePath, "utf8"));
  if (!validation.isArray(parsedJson)) {
    throw new Error("Stored todo data is invalid.");
  }

  const todos: TodoItem[] = [];

  for (const item of parsedJson) {
    if (!validation.isObject(item)) {
      throw new Error("Stored todo data is invalid.");
    }

    if (
      !validation.hasOwnProperty(item, "title") ||
      !validation.hasOwnProperty(item, "status") ||
      !validation.hasOwnProperty(item, "createdAt") ||
      !validation.isNonEmptyString(item.title) ||
      (item.status !== "open" && item.status !== "completed") ||
      !validation.isString(item.createdAt)
    ) {
      throw new Error("Stored todo data is invalid.");
    }

    if (
      validation.hasOwnProperty(item, "completedAt") &&
      item.completedAt !== undefined &&
      !validation.isString(item.completedAt)
    ) {
      throw new Error("Stored todo data is invalid.");
    }

    todos.push({
      title: item.title,
      status: item.status,
      createdAt: item.createdAt,
      completedAt: validation.hasOwnProperty(item, "completedAt") && validation.isString(item.completedAt)
        ? item.completedAt
        : undefined
    });
  }

  return todos;
}

function writeTodos(todos: TodoItem[]): void {
  fs.writeFileSync(getTodoFilePath(), JSON.stringify(todos, null, 2));
}

function readTodoTitle(args: powerTypes.ToolArgs): string {
  if (!validation.isNonEmptyString(args.title)) {
    throw new Error("'title' must be a non-empty string.");
  }

  return args.title.trim();
}

function normalizeTitle(title: string): string {
  return title.trim().toLocaleLowerCase();
}

async function resolveTodoTitleWithAI(todos: TodoItem[], requestedTitle: string): Promise<string | null> {
  if (todos.length === 0) {
    return null;
  }

  const todoTitles = todos.map((item) => item.title);
  const response = await openAIClient.openAIClient.chat.completions.create({
    model: openAIClient.OPENAI_MODEL,
    messages: [
      {
        role: "system",
        content: [
          "You resolve a user's todo reference to one existing todo title.",
          "Return exactly one of the provided titles or NO_MATCH.",
          "Only choose a title if the user's wording clearly refers to it.",
          "Do not explain your answer."
        ].join(" ")
      },
      {
        role: "user",
        content: [
          `User reference: ${requestedTitle}`,
          "Available todo titles:",
          ...todoTitles.map((title) => `- ${title}`)
        ].join("\n")
      }
    ]
  });

  const content = response.choices[0]?.message?.content?.trim();
  if (!validation.isNonEmptyString(content) || content === "NO_MATCH") {
    return null;
  }

  const matchedTitle = todoTitles.find((title) => normalizeTitle(title) === normalizeTitle(content));
  return matchedTitle ?? null;
}

function readStatusFilter(args: powerTypes.ToolArgs): TodoStatus | "all" {
  if (args.status === undefined) {
    return "all";
  }

  if (!validation.isString(args.status)) {
    throw new Error("'status' must be one of: open, completed, all.");
  }

  if (args.status !== "open" && args.status !== "completed" && args.status !== "all") {
    throw new Error("'status' must be one of: open, completed, all.");
  }

  return args.status;
}

async function findTodoByTitle(todos: TodoItem[], title: string): Promise<TodoItem> {
  const normalizedTitle = normalizeTitle(title);
  const matches = todos.filter((item) => normalizeTitle(item.title) === normalizedTitle);

  if (matches.length > 1) {
    throw new Error(`Multiple todos matched '${title}'. Please use unique todo titles.`);
  }

  if (matches.length === 1) {
    return matches[0];
  }

  const resolvedTitle = await resolveTodoTitleWithAI(todos, title);
  if (!resolvedTitle) {
    throw new Error(`Todo '${title}' was not found.`);
  }

  const resolvedTodo = todos.find((item) => normalizeTitle(item.title) === normalizeTitle(resolvedTitle));
  if (!resolvedTodo) {
    throw new Error(`Todo '${title}' was not found.`);
  }

  return resolvedTodo;
}

const todoToolDefinitions: powerTypes.AgentToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "create_todo",
      description: "Create a new todo item in the active session.",
      parameters: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "Short description of the todo item"
          }
        },
        required: ["title"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "list_todos",
      description: "List todo items from the active session.",
      parameters: {
        type: "object",
        properties: {
          status: {
            type: "string",
            description: "Optional filter: open, completed, or all"
          }
        },
        required: [],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "complete_todo",
      description: "Mark a todo item as completed by title.",
      parameters: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "Exact title of the todo item"
          }
        },
        required: ["title"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "delete_todo",
      description: "Delete a todo item from the active session by title.",
      parameters: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "Exact title of the todo item"
          }
        },
        required: ["title"],
        additionalProperties: false
      }
    }
  }
];

const todoToolExecutors: Record<string, powerTypes.ToolExecutor> = {
  create_todo: async (args) => {
    const title = readTodoTitle(args);
    const todos = readTodos();

    if (todos.some((item) => normalizeTitle(item.title) === normalizeTitle(title))) {
      throw new Error(`A todo with the title '${title}' already exists.`);
    }

    const todo: TodoItem = {
      title,
      status: "open",
      createdAt: new Date().toISOString()
    };

    todos.push(todo);
    writeTodos(todos);

    return JSON.stringify(todo, null, 2);
  },
  list_todos: async (args) => {
    const status = readStatusFilter(args);
    const todos = readTodos();
    const filteredTodos = status === "all"
      ? todos
      : todos.filter((item) => item.status === status);

    return JSON.stringify(filteredTodos, null, 2);
  },
  complete_todo: async (args) => {
    const title = readTodoTitle(args);
    const todos = readTodos();
    const todo = await findTodoByTitle(todos, title);

    todo.status = "completed";
    todo.completedAt = new Date().toISOString();
    writeTodos(todos);

    return JSON.stringify(todo, null, 2);
  },
  delete_todo: async (args) => {
    const title = readTodoTitle(args);
    const todos = readTodos();
    const todo = await findTodoByTitle(todos, title);
    const remainingTodos = todos.filter((item) => normalizeTitle(item.title) !== normalizeTitle(todo.title));

    writeTodos(remainingTodos);

    return JSON.stringify({ deleted: todo }, null, 2);
  }
};

export const TODO_POWER: powerTypes.AgentPower = {
  name: "Todo Power",
  description: "Create, list, complete, and delete session-scoped todos.",
  toolDefinitions: todoToolDefinitions,
  toolExecutors: todoToolExecutors
};
