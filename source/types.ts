import type {MCPServerConfig} from './services/mcp-config-service.js';
import type {Tool} from '@modelcontextprotocol/sdk/types.js';
import type {LLMConfig} from './services/llm-service.js';

export type CommandMessage = {
	id: string;
	role: 'command';
	content: string;
	commandResult: CommandResult;
	timestamp: Date;
};

export interface ServerStatus {
	name: string;
	isConnected: boolean;
	config: unknown;
}

export type CommandResultType =
	| 'success'
	| 'error'
	| 'info'
	| 'prompt_api_key'
	| 'prompt_server_config'
	| 'list_servers'
	| 'list_tools'
	| 'model_switched'
	| 'server_connected'
	| 'server_disconnected';

// Specific data types for different command results
export interface PromptApiKeyData {
	provider: string;
	model: string;
}

export interface PromptServerConfigData {
	step: string;
	config?: Partial<MCPServerConfig> & {name?: string};
}

export interface ListServersData {
	servers: ServerStatus[];
}

export interface ListToolsData {
	tools: Tool[];
	error?: string;
	checkTools?: boolean;
}

export interface LLMConfigData {
	llmConfig?: LLMConfig | null;
}

export interface ServerActionData {
	serversAdded?: boolean;
	serverNames?: string[];
	reinitializeAgent?: boolean;
}

export interface CommandResult {
	type: CommandResultType;
	message: string;
	data?:
		| PromptApiKeyData
		| PromptServerConfigData
		| ListServersData
		| ListToolsData
		| LLMConfigData
		| ServerActionData
		| {checkTools?: boolean; reinitializeAgent?: boolean}
		| unknown;
	reinitializeAgent?: boolean;
}

export interface Message {
	id: string;
	role: 'user' | 'assistant' | 'thought';
	content: string;
	timestamp: Date;
}

export interface ToolCall {
	id: string;
	role: 'tool';
	tool_name: string;
	tool_input: Record<string, unknown>;
	tool_output: Record<string, unknown>;
}
