export type ToolArgs = Record<string, unknown>;

export type AgentToolDefinition = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, unknown>;
      required?: string[];
      additionalProperties?: boolean;
    };
  };
};

export const TOOL_DEFINITIONS: AgentToolDefinition[] = [
  {
    type: "function" as const,
    function: {
      name: "add",
      description: "Add two numbers.",
      parameters: {
        type: "object",
        properties: {
          a: {
            type: "number",
            description: "First number"
          },
          b: {
            type: "number",
            description: "Second number"
          }
        },
        required: ["a", "b"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function" as const,
    function: {
      name: "subtract",
      description: "Subtract second number from first number.",
      parameters: {
        type: "object",
        properties: {
          a: {
            type: "number",
            description: "First number"
          },
          b: {
            type: "number",
            description: "Second number"
          }
        },
        required: ["a", "b"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function" as const,
    function: {
      name: "multiply",
      description: "Multiply two numbers.",
      parameters: {
        type: "object",
        properties: {
          a: {
            type: "number",
            description: "First number"
          },
          b: {
            type: "number",
            description: "Second number"
          }
        },
        required: ["a", "b"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function" as const,
    function: {
      name: "divide",
      description: "Divide first number by second number.",
      parameters: {
        type: "object",
        properties: {
          a: {
            type: "number",
            description: "Numerator"
          },
          b: {
            type: "number",
            description: "Denominator"
          }
        },
        required: ["a", "b"],
        additionalProperties: false
      }
    }
  }
];

export type ToolExecutor = (args: ToolArgs) => Promise<string>;

function readOperands(args: ToolArgs): { a: number; b: number } {
  const a = Number(args.a);
  const b = Number(args.b);

  if (Number.isNaN(a) || Number.isNaN(b)) {
    throw new Error("Both 'a' and 'b' must be valid numbers.");
  }

  return { a, b };
}

export const TOOL_EXECUTORS: Record<string, ToolExecutor> = {
  add: async (args) => {
    const { a, b } = readOperands(args);
    return String(a + b);
  },
  subtract: async (args) => {
    const { a, b } = readOperands(args);
    return String(a - b);
  },
  multiply: async (args) => {
    const { a, b } = readOperands(args);
    return String(a * b);
  },
  divide: async (args) => {
    const { a, b } = readOperands(args);
    if (b === 0) {
      throw new Error("Division by zero is not allowed.");
    }
    return String(a / b);
  }
};

export async function executeTool(name: string, rawArgs: string): Promise<string> {
  try {
    const parsedArgs = (rawArgs ? JSON.parse(rawArgs) : {}) as ToolArgs;
    const executor = TOOL_EXECUTORS[name];
    if (!executor) {
      return JSON.stringify({ error: `Unknown tool: ${name}` }, null, 2);
    }
    const result = await executor(parsedArgs);
    return JSON.stringify({ tool: name, result }, null, 2);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Tool execution failed.";
    return JSON.stringify({ tool: name, error: message }, null, 2);
  }
}