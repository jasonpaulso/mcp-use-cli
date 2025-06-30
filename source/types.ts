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
	config: any;
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

export interface CommandResult {
	type: CommandResultType;
	message: string;
	data?: any;
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
	tool_input: Record<string, any>;
	tool_output: Record<string, any>;
}
