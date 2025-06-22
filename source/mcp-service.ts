import { MCPAgent, MCPClient } from 'mcp-use';
import { config } from 'dotenv';
import { CommandHandler, CommandResult } from './commands.js';

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

	async initialize(config?: any) {
		if (this.isInitialized) return;

		try {
			// Load servers from persistent storage and session
			const storedConfig = this.commandHandler.getCurrentStoredConfig();
			const storedServers = storedConfig.mcpServers || {};
			const sessionServers = this.commandHandler.getSessionServers();
			
			// Default filesystem server
			const defaultFilesystemServer = {
				"command": "npx",
				"args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
				"env": {}
			};
			
			// Merge stored servers, session servers with default (session servers override persistent ones)
			const servers = {
				"filesystem": defaultFilesystemServer,
				...storedServers,
				...sessionServers
			};
			
			const defaultConfig = {
				"servers": servers
			};

			const mcpConfig = config || defaultConfig;
			
			// Initialize MCP client with logging
			console.log('Initializing MCP client with config:', JSON.stringify(mcpConfig, null, 2));
			this.client = MCPClient.fromDict(mcpConfig);
			console.log('MCP client created successfully');
			
			// Only initialize agent if we have a configured LLM
			if (this.commandHandler.isAnyProviderAvailable() && this.commandHandler.getCurrentConfig()) {
				await this.initializeAgent();
			}

			this.isInitialized = true;
		} catch (error) {
			console.error('Failed to initialize MCP service:', error);
			throw error;
		}
	}

	private async initializeAgent() {
		if (!this.client) {
			throw new Error('MCP client not initialized');
		}

		try {
			// Create LLM using command handler
			console.log('Creating LLM for agent...');
			const llm = this.commandHandler.createLLM();
			console.log('LLM created successfully');

			// Create agent
			console.log('Creating MCPAgent...');
			this.agent = new MCPAgent({
				llm,
				client: this.client,
				maxSteps: 20,
			});
			console.log('MCPAgent created successfully');

			// Initialize the agent
			console.log('Initializing MCP agent with servers...');
			await this.agent.initialize();
			console.log('MCP agent initialized successfully');
			
			// Wait a bit for servers to start up
			console.log('Waiting for servers to start...');
			await new Promise(resolve => setTimeout(resolve, 2000));
			
			// Log available tools for debugging
			try {
				console.log('Checking for available tools...');
				const toolsResult = await this.getAvailableTools();
				if (toolsResult.tools.length > 0) {
					console.log('✅ Available MCP tools:', toolsResult.tools.map((t: any) => t.name || 'unnamed').join(', '));
				} else {
					console.log('❌ No MCP tools found:', toolsResult.error || 'Unknown reason');
					
					// Try to get more info about the client state
					console.log('Client details:', this.client);
					const clientAny = this.client as any;
					if (clientAny.servers) {
						console.log('Client servers:', Object.keys(clientAny.servers));
						for (const [name, server] of Object.entries(clientAny.servers)) {
							console.log(`Server ${name}:`, server);
						}
					}
				}
			} catch (e) {
				console.log('❌ Error checking MCP tools:', e);
			}
		} catch (error) {
			console.error('❌ Failed to initialize agent:', error);
			console.error('Error details:', error);
			
			// Try to get more specific error info
			if (error instanceof Error) {
				console.error('Error stack:', error.stack);
			}
			throw error;
		}
	}

	private async reinitializeWithNewServers() {
		try {
			console.log('🔄 Reinitializing agent with new servers...');
			
			// Get updated server configuration
			const storedConfig = this.commandHandler.getCurrentStoredConfig();
			const storedServers = storedConfig.mcpServers || {};
			const sessionServers = this.commandHandler.getSessionServers();
			
			console.log('Stored servers:', Object.keys(storedServers));
			console.log('Session servers:', Object.keys(sessionServers));
			
			// Default filesystem server
			const defaultFilesystemServer = {
				"command": "npx",
				"args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
				"env": {}
			};
			
			// Merge stored servers, session servers, with default (session servers override persistent ones)
			const servers = {
				"filesystem": defaultFilesystemServer,
				...storedServers,
				...sessionServers
			};
			
			console.log('Final server configuration:', Object.keys(servers));
			
			const newConfig = {
				"servers": servers
			};

			// Reinitialize MCP client with new configuration
			console.log('Reinitializing MCP client with new config:', JSON.stringify(newConfig, null, 2));
			this.client = MCPClient.fromDict(newConfig);
			console.log('MCP client reinitialized successfully');
			
			// If we have an agent configured, reinitialize it with the new client
			if (this.commandHandler.isAnyProviderAvailable() && this.commandHandler.getCurrentConfig()) {
				console.log('Reinitializing agent...');
				await this.initializeAgent();
				console.log('✅ Agent reinitialized successfully');
			} else {
				console.log('⚠️ No LLM configured, skipping agent initialization');
			}
		} catch (error) {
			console.error('❌ Failed to reinitialize with new servers:', error);
			if (error instanceof Error) {
				console.error('Error stack:', error.stack);
			}
			// Don't throw here, just log - the old agent should still work
		}
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
			
			// If servers were added successfully, reinitialize the agent
			if (commandResult.data?.serversAdded || commandResult.data?.serverAdded) {
				await this.reinitializeWithNewServers();
			}
			
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
						toolsResult.tools.forEach((tool, index) => {
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
				
				// If servers were added, connected, or disconnected, reinitialize the agent
				if (commandResult.data?.serversAdded || commandResult.data?.serverAdded || 
				    commandResult.data?.serverConnected || commandResult.data?.serverDisconnected) {
					await this.reinitializeWithNewServers();
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
			console.error('Error sending message to MCP agent:', error);
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
			console.error('Error streaming message:', error);
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
		
		// Always include filesystem as it's built-in and always connected
		const servers = ['filesystem'];
		
		// Add only connected servers (those in sessionServers)
		const connectedCustomServers = Object.keys(sessionServers);
		servers.push(...connectedCustomServers);
		
		return servers;
	}

	async getAvailableTools(): Promise<{ tools: any[], error?: string }> {
		if (!this.agent) {
			return { tools: [], error: 'No agent initialized' };
		}

		try {
			// Try to access the MCP client directly to get available tools
			if (this.client) {
				// Try to call listTools on the client
				const clientAny = this.client as any;
				if (typeof clientAny.listTools === 'function') {
					const tools = await clientAny.listTools();
					return { tools: tools || [] };
				}
				
				// Try to access servers and their tools
				if (clientAny.servers) {
					const allTools: any[] = [];
					for (const [serverName, server] of Object.entries(clientAny.servers)) {
						const serverAny = server as any;
						if (serverAny.listTools && typeof serverAny.listTools === 'function') {
							try {
								const serverTools = await serverAny.listTools();
								if (Array.isArray(serverTools)) {
									allTools.push(...serverTools.map(tool => ({ ...tool, server: serverName })));
								}
							} catch (e) {
								console.log(`Failed to get tools from server ${serverName}:`, e);
							}
						}
					}
					if (allTools.length > 0) {
						return { tools: allTools };
					}
				}
			}
			
			// Try the agent directly (with type assertions to avoid TS errors)
			const agentAny = this.agent as any;
			if (typeof agentAny.listTools === 'function') {
				const tools = await agentAny.listTools();
				return { tools: tools || [] };
			} else if (typeof agentAny.getTools === 'function') {
				const tools = await agentAny.getTools();
				return { tools: tools || [] };
			} else if (agentAny.tools) {
				return { tools: agentAny.tools || [] };
			} else {
				return { tools: [], error: 'Agent and client do not expose tool listing functionality' };
			}
		} catch (error) {
			return { 
				tools: [], 
				error: `Failed to get tools: ${error instanceof Error ? error.message : 'Unknown error'}` 
			};
		}
	}
}

// Export a singleton instance
export const mcpService = new MCPService();