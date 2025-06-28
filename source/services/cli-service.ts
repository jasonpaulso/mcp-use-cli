import { config } from 'dotenv';
import { CommandHandler } from '../commands.js';
import { Logger } from '../logger.js';
import type { CommandResult } from '../types.js';
import type { ToolCall } from '../types.js';
import { AgentService } from './agent-service.js';
import { LLMService } from './llm-service.js';
import { MCPConfigService } from './mcp-config-service.js';

// Load environment variables
config();

/**
 * The main service for the CLI application. It orchestrates all other services
 * and handles the core logic of the application, such as message processing,
 * command handling, and agent management.
 */
export class CLIService {
	private isInitialized = false;
	private commandHandler: CommandHandler;
	private agentService: AgentService;
	private llmService: LLMService;
	private mcpConfigService: MCPConfigService;

	/**
	 * Initializes the CLIService and its dependencies. This acts as the
	 * composition root for the application's services.
	 */
	constructor() {
		this.llmService = new LLMService();
		this.mcpConfigService = new MCPConfigService();
		this.agentService = new AgentService({
			llmService: this.llmService,
			mcpConfigService: this.mcpConfigService,
		});
		this.commandHandler = new CommandHandler({
			llmService: this.llmService,
			mcpService: this.mcpConfigService,
		});
	}

	/**
	 * Initializes the CLI service, ensuring the agent is ready.
	 * This method is idempotent and will only run once.
	 */
	async initialize() {
		if (this.isInitialized) {
			return;
		}
		await this.initializeAgent();
		this.isInitialized = true;
	}

	/**
	 * Initializes the underlying MCP agent via the AgentService.
	 * If initialization fails, an error is logged, but the CLI can continue
	 * to operate for command-line tasks.
	 */
	public async initializeAgent() {
		try {
			await this.agentService.initializeAgent();
			Logger.info('Agent service initialized successfully.');
		} catch (error) {
			Logger.error('Agent service initialization failed.', {
				error: error instanceof Error ? error.message : String(error),
			});
			// We don't re-throw here, the CLI should be able to run without an agent
		}
	}

	/**
	 * Re-initializes the agent. This is useful when the configuration
	 * (e.g., model or servers) has changed.
	 */
	async refreshAgent() {
		await this.initializeAgent();
	}

	/**
	 * Processes a user's message. It determines if the message is a command
	 * or a prompt for the agent and routes it accordingly. It also handles
	 * special input modes like API key entry or server configuration.
	 * @param message The raw input string from the user.
	 * @param isApiKeyInput True if the input is an API key.
	 * @param pendingProvider The provider for which the API key is being entered.
	 * @param pendingModel The model for which the API key is being entered.
	 * @param isServerConfigInput True if the input is part of the server config flow.
	 * @param serverConfigStep The current step in the server configuration flow.
	 * @param serverConfig The server configuration object being built.
	 * @returns A promise that resolves to the result of the message processing.
	 */
	async sendMessage(
		message: string,
		isApiKeyInput?: boolean,
		pendingProvider?: string,
		pendingModel?: string,
		isServerConfigInput?: boolean,
		serverConfigStep?: string,
		serverConfig?: any,
	): Promise<{
		response: string;
		toolCalls: ToolCall[];
		isCommand?: boolean;
		commandResult?: CommandResult;
	}> {
		// Handle server configuration input
		if (isServerConfigInput && serverConfigStep) {
			const commandResult = this.commandHandler.handleServerConfigInput(
				message.trim(),
				serverConfigStep,
				serverConfig,
			);

			return {
				response: commandResult.message,
				toolCalls: [],
				isCommand: true,
				commandResult,
			};
		}

		// Handle API key input
		if (isApiKeyInput && pendingProvider && pendingModel) {
			const commandResult = this.commandHandler.handleApiKeyInput(
				message.trim(),
				pendingProvider,
				pendingModel,
			);

			// If successful, reinitialize the agent
			if (commandResult.data?.llmConfig) {
				await this.initializeAgent();
			}

			return {
				response: commandResult.message,
				toolCalls: [],
				isCommand: true,
				commandResult,
			};
		}
		// Check if it's a slash command
		if (this.commandHandler.isCommand(message)) {
			try {
				const commandResult = await this.commandHandler.handleCommand(message);

				// Handle special commands that need MCP service interaction
				if (commandResult.data?.checkTools) {
					const toolsResult = await this.agentService.getAvailableTools();
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
						toolsMessage +=
							'3. Ask agent "Which tools do you have?" to see fallback tools\n\n';
						toolsMessage +=
							'⚠️ If you see Wolfram/Wikipedia tools, MCP integration failed completely.';
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
						commandResult: { type: 'info', message: toolsMessage },
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
					commandResult,
				};
			} catch (error) {
				return {
					response: `Command error: ${error instanceof Error ? error.message : 'Unknown error'
						}`,
					toolCalls: [],
					isCommand: true,
					commandResult: { type: 'error', message: 'Command failed' },
				};
			}
		}

		if (!this.agentService.isReady()) {
			const availableProviders = this.llmService.getAvailableProviders();
			if (availableProviders.length === 0) {
				return {
					response: `🤖 Choose a model to get started!\n\nTry one of these popular options:\n• /model openai gpt-4o-mini\n• /model anthropic claude-3-5-sonnet-20241022\n• /model google gemini-1.5-pro\n\nThe CLI will help you set up the API key when needed.\nUse /models to see all available models.`,
					toolCalls: [],
				};
			} else {
				const firstProvider = availableProviders[0];
				const exampleModel = firstProvider
					? this.getExampleModel(firstProvider)
					: 'model-name';
				return {
					response: `🔧 No model selected.\n\nAvailable providers: ${availableProviders.join(
						', ',
					)}\n\nUse /model <provider> <model> to get started.\n\nExample: /model ${firstProvider} ${exampleModel}`,
					toolCalls: [],
				};
			}
		}

		try {
			const result = await this.agentService.sendMessage(message);

			return {
				...result,
				isCommand: false,
			};
		} catch (error) {
			Logger.error('Error sending message via Agent service', {
				error: error instanceof Error ? error.message : 'Unknown error',
				stack: error instanceof Error ? error.stack : undefined,
			});
			throw error;
		}
	}

	/**
	 * Returns an example model name for a given provider.
	 * @param provider The name of the LLM provider.
	 * @returns An example model name string.
	 */
	private getExampleModel(provider: string): string {
		const examples = {
			openai: 'gpt-4o-mini',
			anthropic: 'claude-3-5-sonnet-20241022',
			google: 'gemini-1.5-pro',
			mistral: 'mistral-large-latest',
		};
		return examples[provider as keyof typeof examples] || 'model-name';
	}

	/**
	 * Checks if the CLI service has been initialized.
	 * @returns True if the service is initialized, false otherwise.
	 */
	isReady(): boolean {
		// The CLI is always "ready" to take commands, but the agent might not be.
		// We rely on agentService.isReady() inside sendMessage.
		return this.isInitialized;
	}

	/**
	 * Gets a formatted string representing the current model.
	 * @returns A string like "provider/model-name" or a status message.
	 */
	getCurrentModel(): string {
		const config = this.llmService.getCurrentConfig();
		if (!config) {
			const availableProviders = this.llmService.getAvailableProviders();
			if (availableProviders.length === 0) {
				return 'No API keys configured';
			}
			return 'No model selected';
		}
		return `${config.provider}/${config.model}`;
	}

	/**
	 * Gets a list of all configured server names, both persistent and session-based.
	 * @returns An array of unique server names.
	 */
	getConfiguredServers(): string[] {
		const storedServers = this.mcpConfigService.getConfiguredServers();
		const sessionServers = this.mcpConfigService.getSessionServers();

		// Combine persistent and session servers, ensuring no duplicates
		const allServerNames = new Set([
			...Object.keys(storedServers),
			...Object.keys(sessionServers),
		]);

		return Array.from(allServerNames);
	}

	/**
	 * Gets a list of currently connected server names.
	 * @returns An array of connected server names.
	 */
	getConnectedServers(): string[] {
		const sessionServers = this.mcpConfigService.getSessionServers();
		const connectedCustomServers = Object.keys(sessionServers);
		return connectedCustomServers;
	}

	/**
	 * Gets the list of available tools from the agent.
	 * @returns A promise that resolves to an object containing the tools or an error.
	 */
	async getAvailableTools(): Promise<{ tools: any[]; error?: string }> {
		return this.agentService.getAvailableTools();
	}
}

// Export a singleton instance
export const cliService = new CLIService();
