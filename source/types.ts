export type CommandMessage = {
	id: string;
	role: 'command';
	content: string;
	commandResult: CommandResult;
	timestamp: Date;
};

export interface CommandResult {
	type: 'success' | 'error' | 'info' | 'prompt_key' | 'prompt_server_config';
	message: string;
	data?: any;
}

export interface Message {
	id: string;
	role: 'user' | 'assistant';
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
