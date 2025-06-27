import { MCPAgent, MCPClient } from 'mcp-use';
import { config } from 'dotenv';
import { CommandHandler, CommandResult } from './commands.js';
import { Logger } from './logger.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js'
// Load environment variables
config();

export interface MCPMessage {
	id: string;
	role: 'user' | 'assistant';
	content: string;
	timestamp: Date;
}

export interface MCPToolCall {
	id: string;
	role: 'tool';
	tool_name: string;
	tool_input: Record<string, any>;
	tool_output: Record<string, any>;
}

export class MCPService {
	private agent: MCPAgent | null = null;
	private isInitialized = false;
	private commandHandler = new CommandHandler();
	private client: MCPClient | null = null;

	async initialize() {
		if (this.isInitialized) {
			return;
		}
		await this.initializeAgent()
		this.isInitialized = true;
	}

	public async initializeAgent() {
		const sessionServers = this.commandHandler.getSessionServers()
		const llm = this.commandHandler.createLLM()
		const config = {
			mcpServers: {
				...sessionServers
			}
		}
		Logger.info('Initializing MCP client with config', { config })
		const client = new MCPClient(config)
		// Create agent with memory_enabled=true
		const agent = new MCPAgent({
			llm,
			client,
			maxSteps: 15,
			memoryEnabled: true, // Enable built-in conversation memory
		})

		await this.agent?.initialize()
		this.agent = agent;
		this.client = client;
	}

	async refreshAgent() {
		await this.initializeAgent()
	}

	async sendMessage(message: string, isApiKeyInput?: boolean, pendingProvider?: string, pendingModel?: string, isServerConfigInput?: boolean, serverConfigStep?: string, serverConfig?: any): Promise<{
		response: string;
		toolCalls: MCPToolCall[];
		isCommand?: boolean;
		commandResult?: CommandResult;
	}> {
		// Handle server configuration input
		if (isServerConfigInput && serverConfigStep) {
			const commandResult = this.commandHandler.handleServerConfigInput(message.trim(), serverConfigStep, serverConfig);

			
			

			return {
				response: commandResult.message,
				toolCalls: [],
				isCommand: true,
				commandResult
			};
		}

		// Handle API key input
		if (isApiKeyInput && pendingProvider && pendingModel) {
			const commandResult = this.commandHandler.handleApiKeyInput(message.trim(), pendingProvider, pendingModel);

			// If successful, reinitialize the agent
			if (commandResult.data?.llmConfig) {
				await this.initializeAgent();
			}

			return {
				response: commandResult.message,
				toolCalls: [],
				isCommand: true,
				commandResult
			};
		}
		// Check if it's a slash command
		if (this.commandHandler.isCommand(message)) {
			try {
				const commandResult = await this.commandHandler.handleCommand(message);

				// Handle special commands that need MCP service interaction
				if (commandResult.data?.checkTools) {
					const toolsResult = await this.getAvailableTools();
					let toolsMessage = '🔧 Available MCP Tools:\n\n';

					if (toolsResult.error) {
						toolsMessage += `❌ Error: ${toolsResult.error}\n\n`;
						toolsMessage += '💡 This might indicate:\n';
						toolsMessage += '• MCP servers failed to start\n';
						toolsMessage += '• Agent fell back to default LLM tools\n';
						toolsMessage += '• Connection issues with configured servers\n\n';
						toolsMessage += 'Check console logs for more details.';
					} else if (toolsResult.tools.length === 0) {
						toolsMessage += '❌ No MCP tools found\n\n';
						toolsMessage += '💡 This suggests:\n';
						toolsMessage += '• MCP servers failed to start or connect\n';
						toolsMessage += '• Agent fell back to default LangChain tools\n';
						toolsMessage += '• Server packages may not be installed\n\n';
						toolsMessage += '🔍 Debug steps:\n';
						toolsMessage += '1. Check console logs for errors\n';
						toolsMessage += '2. Test server manually: /test-server <name>\n';
						toolsMessage += '3. Ask agent "Which tools do you have?" to see fallback tools\n\n';
						toolsMessage += '⚠️ If you see Wolfram/Wikipedia tools, MCP integration failed completely.';
					} else {
						toolsMessage += `✅ Found ${toolsResult.tools.length} MCP tools:\n\n`;
						toolsResult.tools.forEach((tool: any, index) => {
							toolsMessage += `${index + 1}. **${tool.name || 'Unknown'}**`;
							if (tool.description) {
								toolsMessage += `: ${tool.description}`;
							}
							toolsMessage += '\n';
						});
					}

					return {
						response: toolsMessage,
						toolCalls: [],
						isCommand: true,
						commandResult: { type: 'info', message: toolsMessage }
					};
				}

				// If the command changed the LLM config, reinitialize the agent
				if (commandResult.data?.llmConfig) {
					await this.initializeAgent();
				}

				
				

				return {
					response: commandResult.message,
					toolCalls: [],
					isCommand: true,
					commandResult
				};
			} catch (error) {
				return {
					response: `Command error: ${error instanceof Error ? error.message : 'Unknown error'}`,
					toolCalls: [],
					isCommand: true,
					commandResult: { type: 'error', message: 'Command failed' }
				};
			}
		}

		if (!this.agent) {
			const availableProviders = this.commandHandler.getAvailableProviders();
			if (availableProviders.length === 0) {
				return {
					response: `🤖 Choose a model to get started!\n\nTry one of these popular options:\n• /model openai gpt-4o-mini\n• /model anthropic claude-3-5-sonnet-20241022\n• /model google gemini-1.5-pro\n\nThe CLI will help you set up the API key when needed.\nUse /models to see all available models.`,
					toolCalls: [],
				};
			} else {
				const firstProvider = availableProviders[0];
				const exampleModel = firstProvider ? this.getExampleModel(firstProvider) : 'model-name';
				return {
					response: `🔧 No model selected.\n\nAvailable providers: ${availableProviders.join(', ')}\n\nUse /model <provider> <model> to get started.\n\nExample: /model ${firstProvider} ${exampleModel}`,
					toolCalls: [],
				};
			}
		}

		try {
			const result = await this.agent.run(message);

			// Parse the result to extract tool calls
			// Note: This is a simplified example - you may need to adjust based on actual mcp-use response format
			const toolCalls: MCPToolCall[] = [];

			// Extract tool calls from the result if available
			// This would depend on how mcp-use exposes tool execution details

			return {
				response: result || 'No response received',
				toolCalls,
			};
		} catch (error) {
			Logger.error('Error sending message to MCP agent', {
				error: error instanceof Error ? error.message : 'Unknown error',
				stack: error instanceof Error ? error.stack : undefined
			});
			throw error;
		}
	}

	private getExampleModel(provider: string): string {
		const examples = {
			openai: 'gpt-4o-mini',
			anthropic: 'claude-3-5-sonnet-20241022',
			google: 'gemini-1.5-pro',
			mistral: 'mistral-large-latest'
		};
		return examples[provider as keyof typeof examples] || 'model-name';
	}

	async *streamMessage(message: string): AsyncGenerator<{
		content?: string;
		toolCall?: MCPToolCall;
		done: boolean;
	}> {
		if (!this.agent) {
			throw new Error('MCP service not initialized');
		}

		try {
			// MCPAgent doesn't support streaming in the current version
			// Fallback to non-streaming
			const result = await this.sendMessage(message);
			yield { content: result.response, done: false };

			for (const toolCall of result.toolCalls) {
				yield { toolCall, done: false };
			}

			yield { done: true };
		} catch (error) {
			Logger.error('Error streaming message:', {
				error: error instanceof Error ? error.message : 'Unknown error',
				stack: error instanceof Error ? error.stack : undefined
			});
			yield { content: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`, done: true };
		}
	}

	isReady(): boolean {
		return this.isInitialized && this.agent !== null;
	}

	getCurrentModel(): string {
		const config = this.commandHandler.getCurrentConfig();
		if (!config) {
			const availableProviders = this.commandHandler.getAvailableProviders();
			if (availableProviders.length === 0) {
				return 'No API keys configured';
			}
			return 'No model selected';
		}
		return `${config.provider}/${config.model}`;
	}

	getConfiguredServers(): string[] {
		const storedConfig = this.commandHandler.getCurrentStoredConfig();
		const storedServers = storedConfig.mcpServers || {};
		const sessionServers = this.commandHandler.getSessionServers();

		// Always include filesystem as it's the default
		const servers = ['filesystem'];

		// Add persistent servers (avoid duplicates)
		const persistentCustomServers = Object.keys(storedServers).filter(name => name !== 'filesystem');
		servers.push(...persistentCustomServers);

		// Add session servers (avoid duplicates)
		const sessionCustomServers = Object.keys(sessionServers).filter(name => name !== 'filesystem' && !persistentCustomServers.includes(name));
		servers.push(...sessionCustomServers);

		return servers;
	}

	getConnectedServers(): string[] {
		const sessionServers = this.commandHandler.getSessionServers();
		const connectedCustomServers = Object.keys(sessionServers);
		return connectedCustomServers;
	}

	async getAvailableTools(): Promise<{ tools: Tool[], error?: string }> {
		Logger.debug('Getting available tools - starting check');

		if (!this.agent) {
			const error = 'No agent initialized';
			Logger.warn('Tools check failed - no agent', { error });
			return { tools: [], error };
		}

		try {
			if (this.client) {
				Logger.debug('Checking client for tools', {
					clientType: this.client.constructor.name,
					clientKeys: Object.keys(this.client)
				});

				let allTools: Tool[] = [];

				// Iterate through sessions
				for (const [sessionName, session] of Object.entries(this.client.getAllActiveSessions())) {
					Logger.debug(`Checking session: ${sessionName}`, {
						sessionType: typeof session,
						sessionConstructor: session?.constructor?.name,
						sessionKeys: session ? Object.keys(session) : []
					});

					// Try to get tools from connector
					if (session.connector) {
						Logger.debug(`Checking connector in session ${sessionName}`, {
							connectorType: typeof session.connector,
							connectorConstructor: session.connector?.constructor?.name,
							connectorKeys: session.connector ? Object.keys(session.connector) : []
						});

						if (session.connector.tools && Array.isArray(session.connector.tools)) {
							Logger.debug(`Found tools in connector for session ${sessionName}`, {
								toolCount: session.connector.tools.length,
								tools: session.connector.tools
							});
							allTools.push(...session.connector.tools.map((tool: any) => ({ ...tool, session: sessionName })));
						}
					}
				}
				return { tools: allTools };
			}
		} catch (error) {
			const errorMsg = `Failed to get tools: ${error instanceof Error ? error.message : 'Unknown error'}`;
			Logger.error('Tools check failed with exception', {
				error: errorMsg,
				stack: error instanceof Error ? error.stack : undefined
			});
			return {
				tools: [],
				error: errorMsg
			};
		}

		// Default return if client doesn't exist
		return { tools: [], error: 'No client available' };
	}
}

// Export a singleton instance
export const mcpService = new MCPService();