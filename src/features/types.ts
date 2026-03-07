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

export type ToolExecutor = (args: ToolArgs) => Promise<string>;

export type AgentFeature = {
  name: string;
  description: string;
  toolDefinitions: AgentToolDefinition[];
  toolExecutors: Record<string, ToolExecutor>;
};
