import {MCPAgent, MCPClient} from 'mcp-use';
import {Logger} from '../logger.js';
import type {Tool} from '@modelcontextprotocol/sdk/types.js';
import type {ToolCall, CommandResult} from '../types.js';
import {LLMService} from './llm-service.js';
import type {AgentStep} from '@langchain/core/agents';
import type {MCPServerConfig} from './mcp-config-service.js';

export interface AgentServiceDeps {
	llmService: LLMService;
}

export class AgentService {
	private agent: MCPAgent | null = null;
	private client: MCPClient | null = null;
	private llmService: LLMService;

	constructor(deps: AgentServiceDeps) {
		this.llmService = deps.llmService;
		this.client = new MCPClient({});
		this.agent = new MCPAgent({
			llm: this.llmService.createLLM(),
			client: this.client,
			maxSteps: 15,
			memoryEnabled: true, // Enable built-in conversation memory
		});
	}

	public isReady(): boolean {
		return this.agent !== null;
	}

	async *sendMessage(message: string): AsyncGenerator<{
		response?: string;
		toolCalls?: ToolCall[];
		thought?: string;
	}> {
		if (!this.agent) {
			throw new Error('Agent not initialized');
		}

		try {
			// The stream method yields AgentSteps for each tool call and returns the final string response.
			const generator = this.agent.stream(message);

			let result = await generator.next();

			while (!result.done) {
				const agentStep: AgentStep = result.value;

				if (agentStep.action) {
					// The 'log' contains the "Thought:" part.
					if (agentStep.action.log) {
						yield {thought: agentStep.action.log};
					}
					// Map AgentStep to our internal ToolCall type
					const toolCall: ToolCall = {
						id: `${agentStep.action.tool}-${Date.now()}`, // Create a simple unique ID
						role: 'tool',
						tool_name: agentStep.action.tool,
						tool_input: agentStep.action.toolInput as Record<string, unknown>,
						tool_output: {result: agentStep.observation},
					};

					yield {toolCalls: [toolCall]};
				}
				result = await generator.next();
			}

			// When the generator is done, the final response is in result.value
			const finalResponse: string = result.value;
			if (finalResponse) {
				yield {response: finalResponse};
			}
		} catch (error) {
			Logger.error('Error sending message to MCP agent', {
				error: error instanceof Error ? error.message : 'Unknown error',
				stack: error instanceof Error ? error.stack : undefined,
			});
			throw error;
		}
	}

	async getAvailableTools(): Promise<{tools: Tool[]; error?: string}> {
		Logger.debug('Getting available tools - starting check');

		if (!this.client) {
			const error = 'No agent/client initialized';
			Logger.warn('Tools check failed - no client', {error});
			return {tools: [], error};
		}

		try {
			const allTools: Tool[] = [];
			const sessions = this.client.getAllActiveSessions();
			for (const [sessionName, session] of Object.entries(sessions)) {
				if (
					session.connector?.tools &&
					Array.isArray(session.connector.tools)
				) {
					Logger.debug(`Found tools in connector for session ${sessionName}`, {
						toolCount: session.connector.tools.length,
					});
					const sessionTools = session.connector.tools.map((tool: Tool) => ({
						...tool,
						session: sessionName,
					}));
					allTools.push(...sessionTools);
				}
			}
			return {tools: allTools};
		} catch (error) {
			const errorMsg = `Failed to get tools: ${
				error instanceof Error ? error.message : 'Unknown error'
			}`;
			Logger.error('Tools check failed with exception', {
				error: errorMsg,
				stack: error instanceof Error ? error.stack : undefined,
			});
			return {
				tools: [],
				error: errorMsg,
			};
		}
	}

	/**
	 * Handles the /tools command to list available MCP tools.
	 * @returns A CommandResult indicating that tools should be checked
	 */
	handleListToolsCommand(): CommandResult {
		return {
			type: 'info',
			message:
				'🔧 Checking available MCP tools...\n\nThis command will show tools available from connected MCP servers.\nNote: This requires the MCP service to provide tool listing functionality.',
			data: {checkTools: true},
		};
	}

	/**
	 * Gets all active MCP sessions.
	 * @returns Object with session names as keys
	 */
	getActiveSessions(): Record<string, unknown> {
		if (!this.client) {
			return {};
		}
		try {
			return this.client.getAllActiveSessions();
		} catch (error) {
			Logger.error('Failed to get active sessions', {
				error: error instanceof Error ? error.message : 'Unknown error',
			});
			return {};
		}
	}

	/**
	 * Checks if a specific server is connected.
	 * @param serverName - Name of the server to check
	 * @returns True if the server is connected
	 */
	isServerConnected(serverName: string): boolean {
		const sessions = this.getActiveSessions();
		return !!sessions[serverName];
	}

	/**
	 * Gets the list of connected server names.
	 * @returns Array of connected server names
	 */
	getConnectedServerNames(): string[] {
		return Object.keys(this.getActiveSessions());
	}

	/**
	 * Reinitialize the agent with current config
	 */
	async reinitializeAgent(): Promise<void> {
		if (!this.agent || !this.client) {
			throw new Error('Agent not initialized');
		}
		const newClient = new MCPClient(this.client.getConfig());
		this.agent = new MCPAgent({
			llm: this.llmService.createLLM(),
			client: newClient,
			maxSteps: 30,
			memoryEnabled: true, // Enable built-in conversation memory
		});
		await this.agent?.initialize();
	}
	/**
	 * Connects a new MCP server without reinitializing the entire agent.
	 * @param serverName - Name of the server to connect
	 * @param serverConfig - Configuration for the server
	 * @returns Promise that resolves when connected
	 */
	async connectServer(
		serverName: string,
		serverConfig: MCPServerConfig,
	): Promise<void> {
		if (!this.agent || !this.client) {
			throw new Error('Agent not initialized');
		}

		if (this.isServerConnected(serverName)) {
			throw new Error(`Server "${serverName}" is already connected`);
		}
		Logger.info('Connecting to server', serverName);
		const currentConfig = this.client.getConfig();
		const newConfig = {
			mcpServers: {
				...currentConfig['mcpServers'],
				[serverName]: serverConfig,
			},
		};
		this.client = new MCPClient(newConfig);

		this.agent = new MCPAgent({
			llm: this.llmService.createLLM(),
			client: this.client,
			maxSteps: 30,
			memoryEnabled: true, // Enable built-in conversation memory
		});
		await this.agent?.initialize();
	}

	/**
	 * Disconnects an MCP server without reinitializing the entire agent.
	 * @param serverName - Name of the server to disconnect
	 * @returns Promise that resolves when disconnected
	 */
	async disconnectServer(serverName: string): Promise<void> {
		if (!this.agent || !this.client) {
			throw new Error('Agent not initialized');
		}

		if (!this.isServerConnected(serverName)) {
			throw new Error(`Server "${serverName}" is not connected`);
		}

		Logger.info('Disconnecting from server', serverName);
		const currentConfig = this.client.getConfig();
		const mcpServers = {...currentConfig['mcpServers']};
		delete mcpServers[serverName];

		const newConfig = {
			mcpServers,
		};

		this.client = new MCPClient(newConfig);

		this.agent = new MCPAgent({
			llm: this.llmService.createLLM(),
			client: this.client,
			maxSteps: 30,
			memoryEnabled: true, // Enable built-in conversation memory
		});
		await this.agent?.initialize();
	}
}
