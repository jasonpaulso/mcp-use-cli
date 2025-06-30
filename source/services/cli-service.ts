import {config} from 'dotenv';
import {Logger} from '../logger.js';
import type {CommandResult} from '../types.js';
import type {ToolCall} from '../types.js';
import type {Tool} from '@modelcontextprotocol/sdk/types.js';
import type {LLMConfigData, ServerActionData} from '../types.js';
import {AgentService} from './agent-service.js';
import {LLMService} from './llm-service.js';
import {MCPConfigService, type MCPServerConfig} from './mcp-config-service.js';
import {UtilityService} from './utility-service.js';

// Load environment variables
config();

/**
 * The main service for the CLI application. It orchestrates all other services
 * and handles the core logic of the application, such as message processing,
 * command handling, and agent management.
 */
/**
 * Command handler function type that processes command arguments and returns a result.
 */
type CommandHandler = (
	args: string[],
) => CommandResult | Promise<CommandResult>;

/**
 * Registry entry for a command, including its handler and metadata.
 */
export interface CommandRegistryEntry {
	handler: CommandHandler;
	description: string;
	getSuggestions?: (args: string[]) => Promise<string[]> | string[];
}

export class CLIService {
	private isInitialized = false;
	private agentService: AgentService;
	private llmService: LLMService;
	private mcpConfigService: MCPConfigService;
	private utilityService: UtilityService;
	private commandRegistry: Map<string, CommandRegistryEntry>;

	/**
	 * Initializes the CLIService and its dependencies. This acts as the
	 * composition root for the application's services.
	 */
	constructor() {
		// Initialize services
		this.llmService = new LLMService();
		this.mcpConfigService = new MCPConfigService();
		this.agentService = new AgentService({
			llmService: this.llmService,
		});
		this.utilityService = new UtilityService({
			llmService: this.llmService,
			mcpConfigService: this.mcpConfigService,
		});

		// Initialize command registry
		this.commandRegistry = new Map();
		this.registerCommands();
	}

	/**
	 * Registers all available commands in the command registry.
	 * This creates a centralized mapping of command names to their handlers.
	 */
	private registerCommands() {
		// LLM-related commands
		this.commandRegistry.set('/model', {
			handler: args => this.llmService.handleModelCommand(args),
			description: 'Choose your LLM provider and model',
			getSuggestions: async args => {
				if (args.length <= 1) {
					return this.llmService.getAllProviderNames();
				}
				return [];
			},
		});
		this.commandRegistry.set('/models', {
			handler: () => this.llmService.handleListModelsCommand(),
			description: 'List available models',
		});
		this.commandRegistry.set('/setkey', {
			handler: args => this.llmService.handleSetKeyCommand(args),
			description: 'Set API key manually',
		});
		this.commandRegistry.set('/clearkeys', {
			handler: () => this.llmService.handleClearKeysCommand(),
			description: 'Clear all stored API keys',
		});
		this.commandRegistry.set('/config', {
			handler: args => this.llmService.handleConfigCommand(args),
			description: 'Configure temperature and max tokens',
		});

		// MCP server commands with subcommands
		this.commandRegistry.set('/server', {
			handler: args => this.handleServerCommand(args),
			description: 'Manage MCP servers',
			getSuggestions: () => ['add', 'connect', 'disconnect'],
		});
		this.commandRegistry.set('/server add', {
			handler: () => this.handleServerAddCommand(),
			description: 'Configure a new server',
		});
		this.commandRegistry.set('/server connect', {
			handler: async args => this.handleServerConnectCommand(args),
			description: 'Connect to a configured server',
			getSuggestions: async () => {
				const configured = Object.keys(
					this.mcpConfigService.getConfiguredServers(),
				);
				const connected = this.agentService.getConnectedServerNames();
				return configured.filter(s => !connected.includes(s));
			},
		});
		this.commandRegistry.set('/server disconnect', {
			handler: async args => this.handleServerDisconnectCommand(args),
			description: 'Disconnect from a server',
			getSuggestions: async () => this.agentService.getConnectedServerNames(),
		});
		this.commandRegistry.set('/servers', {
			handler: () => this.handleListServersCommand(),
			description: 'List configured servers',
		});
		this.commandRegistry.set('/test-server', {
			handler: args => this.mcpConfigService.handleTestServerCommand(args),
			description: 'Test server configuration',
		});
		this.commandRegistry.set('/tools', {
			handler: () => this.agentService.handleListToolsCommand(),
			description: 'Show available MCP tools',
		});

		// Utility commands
		this.commandRegistry.set('/help', {
			handler: () => this.utilityService.handleHelpCommand(),
			description: 'Show this help',
		});
		this.commandRegistry.set('/status', {
			handler: () => this.utilityService.handleStatusCommand(),
			description: 'Show current configuration',
		});
		this.commandRegistry.set('/logs', {
			handler: args => this.utilityService.handleLogsCommand(args),
			description: 'View debug logs',
		});
		this.commandRegistry.set('/clearlogs', {
			handler: () => this.utilityService.handleClearLogsCommand(),
			description: 'Clear debug logs',
		});
		this.commandRegistry.set('/history', {
			handler: () => this.utilityService.handleHistoryCommand(),
			description: 'Info about input history navigation',
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
			await this.agentService.reinitializeAgent();
			Logger.info('Agent service initialized successfully.');
		} catch (error) {
			Logger.error('Agent service initialization failed.', {
				error: error instanceof Error ? error.message : String(error),
			});
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
	 * Checks if the input is a slash command.
	 * @param input - The user input to check
	 * @returns True if the input starts with /
	 */
	private isCommand(input: string): boolean {
		return input.trim().startsWith('/');
	}

	/**
	 * Handles command execution by routing to the appropriate service.
	 * @param input - The full command input including the slash
	 * @returns A promise that resolves to the command result
	 */
	private async handleCommand(input: string): Promise<CommandResult> {
		const parts = input.trim().split(/\s+/);
		const command = parts[0];
		let args = parts.slice(1);

		// Try to match with subcommand first
		let commandEntry = null;
		if (args.length > 0) {
			// Try matching with one subcommand (e.g., "/server add")
			const withSubcommand = `${command} ${args[0]}`;
			commandEntry = this.commandRegistry.get(withSubcommand);
			if (commandEntry) {
				// Remove the subcommand from args since it's part of the command
				args = args.slice(1);
			}
		}

		// If no subcommand match, try the base command
		if (!commandEntry) {
			commandEntry = this.commandRegistry.get(command!);
		}

		if (!commandEntry) {
			return {
				type: 'error',
				message: `Unknown command: ${command}. Type /help for available commands.`,
			};
		}

		// Execute the command handler
		try {
			return await commandEntry.handler(args);
		} catch (error) {
			Logger.error(`Error executing command ${command}`, {
				error: error instanceof Error ? error.message : String(error),
				stack: error instanceof Error ? error.stack : undefined,
			});
			return {
				type: 'error',
				message: `Command failed: ${
					error instanceof Error ? error.message : 'Unknown error'
				}`,
			};
		}
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
	async *sendMessage(
		message: string,
		isApiKeyInput?: boolean,
		pendingProvider?: string,
		pendingModel?: string,
		isServerConfigInput?: boolean,
		serverConfigStep?: string,
		serverConfig?: Partial<MCPServerConfig> & {name?: string},
	): AsyncGenerator<{
		response?: string;
		toolCalls?: ToolCall[];
		thought?: string;
		isCommand?: boolean;
		commandResult?: CommandResult;
		done: boolean;
	}> {
		// Handle server configuration input (non-streaming)
		if (isServerConfigInput && serverConfigStep) {
			const commandResult = this.mcpConfigService.handleServerConfigInput(
				message.trim(),
				serverConfigStep,
				serverConfig,
			);
			yield {
				response: commandResult.message,
				toolCalls: [],
				isCommand: true,
				commandResult,
				done: true,
			};
			return;
		}

		// Handle API key input (non-streaming)
		if (isApiKeyInput && pendingProvider && pendingModel) {
			const commandResult = this.llmService.handleApiKeyInput(
				message.trim(),
				pendingProvider,
				pendingModel,
			);

			// If successful, reinitialize the agent
			const llmData = commandResult.data as LLMConfigData | undefined;
			if (llmData?.llmConfig) {
				await this.initializeAgent();
			}

			yield {
				response: commandResult.message,
				toolCalls: [],
				isCommand: true,
				commandResult,
				done: true,
			};
			return;
		}
		// Check if it's a slash command (non-streaming)
		if (this.isCommand(message)) {
			try {
				const commandResult = await this.handleCommand(message);

				// Handle special commands that need coordination
				if (
					commandResult.data &&
					typeof commandResult.data === 'object' &&
					'checkTools' in commandResult.data &&
					commandResult.data.checkTools
				) {
					const toolsResult = await this.agentService.getAvailableTools();

					yield {
						response: 'Available MCP Tools',
						toolCalls: [],
						isCommand: true,
						commandResult: {
							type: 'list_tools',
							message: 'Available MCP Tools',
							data: toolsResult,
						},
						done: true,
					};
					return;
				}

				// If the command changed the LLM config, added servers, or needs agent reinitialization
				const cmdData = commandResult.data as
					| (LLMConfigData & ServerActionData)
					| undefined;
				if (
					cmdData?.llmConfig ||
					cmdData?.serversAdded ||
					cmdData?.reinitializeAgent
				) {
					await this.initializeAgent();
				}

				yield {
					response: commandResult.message,
					toolCalls: [],
					isCommand: true,
					commandResult,
					done: true,
				};
				return;
			} catch (error) {
				yield {
					response: `Command error: ${
						error instanceof Error ? error.message : 'Unknown error'
					}`,
					toolCalls: [],
					isCommand: true,
					commandResult: {type: 'error', message: 'Command failed'},
					done: true,
				};
				return;
			}
		}

		if (!this.agentService.isReady()) {
			const availableProviders = this.llmService.getAvailableProviders();
			if (availableProviders.length === 0) {
				yield {
					response: `Choose a model to get started!\n\nTry one of these popular options:\n• /model openai gpt-4o-mini\n• /model anthropic claude-3-5-sonnet-20241022\n• /model google gemini-1.5-pro\n\nThe CLI will help you set up the API key when needed.\nUse /models to see all available models.`,
					toolCalls: [],
					done: true,
				};
			} else {
				const firstProvider = availableProviders[0];
				const exampleModel = firstProvider
					? this.getExampleModel(firstProvider)
					: 'model-name';
				yield {
					response: `🔧 No model selected.\n\nAvailable providers: ${availableProviders.join(
						', ',
					)}\n\nUse /model <provider> <model> to get started.\n\nExample: /model ${firstProvider} ${exampleModel}`,
					toolCalls: [],
					done: true,
				};
			}
			return;
		}

		// Handle agent messages (streaming)
		try {
			const generator = this.agentService.sendMessage(message);

			for await (const chunk of generator) {
				yield {
					response: chunk.response,
					toolCalls: chunk.toolCalls,
					thought: chunk.thought,
					isCommand: false,
					done: false,
				};
			}
			yield {done: true};
		} catch (error) {
			Logger.error('Error sending message via Agent service', {
				error: error instanceof Error ? error.message : 'Unknown error',
				stack: error instanceof Error ? error.stack : undefined,
			});
			yield {
				response: `Error: ${
					error instanceof Error ? error.message : 'Unknown error'
				}`,
				thought: undefined,
				done: true,
			};
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
	 * Gets a list of all configured server names from persistent storage.
	 * @returns An array of configured server names.
	 */
	getConfiguredServers(): string[] {
		const storedServers = this.mcpConfigService.getConfiguredServers();
		return Object.keys(storedServers);
	}

	/**
	 * Gets a list of currently connected server names.
	 * @returns An array of connected server names.
	 */
	getConnectedServers(): string[] {
		return this.agentService.getConnectedServerNames();
	}

	/**
	 * Gets the list of available tools from the agent.
	 * @returns A promise that resolves to an object containing the tools or an error.
	 */
	async getAvailableTools(): Promise<{tools: Tool[]; error?: string}> {
		return this.agentService.getAvailableTools();
	}

	/**
	 * Handles the /servers command by combining configuration and connection status.
	 * @returns A CommandResult with the server list including connection status
	 */
	private handleListServersCommand(): CommandResult {
		const configuredServers = this.mcpConfigService.getAllServers();
		const connectedServerNames = this.agentService.getConnectedServerNames();

		if (configuredServers.length === 0) {
			return {
				type: 'info',
				message:
					'No custom servers configured.\n\nUse /server add to configure servers, then /server connect <name> to connect.',
			};
		}

		// Add connection status to each server
		const serversWithStatus = configuredServers.map(server => ({
			...server,
			isConnected: connectedServerNames.includes(server.name),
		}));

		return {
			type: 'list_servers',
			message: 'MCP Server Status:',
			data: {servers: serversWithStatus},
		};
	}

	/**
	 * Handles the base /server command to show subcommands.
	 * @param args - Command arguments
	 * @returns A CommandResult with help information
	 */
	private handleServerCommand(args: string[]): CommandResult {
		if (args.length === 0) {
			return {
				type: 'info',
				message:
					'Server management commands:\n\n/server add              - Configure a new server (stored but not connected)\n/server connect <name>   - Connect to a configured server by name\n/server disconnect <name> - Disconnect from a connected server\n/servers                 - List configured servers and connection status\n\nUse /server <command> for specific help.',
			};
		}

		// If we get here, it means the subcommand wasn't recognized
		return {
			type: 'error',
			message:
				'Usage: /server <command>\n\nCommands:\n  add              - Configure server\n  connect <name>   - Connect to server\n  disconnect <name> - Disconnect server\n\nExample: /server connect airbnb',
		};
	}

	/**
	 * Handles the /server add subcommand.
	 * @returns A CommandResult to start server configuration
	 */
	private handleServerAddCommand(): CommandResult {
		return {
			type: 'prompt_server_config',
			message:
				'Paste a complete JSON configuration for one or more MCP servers.\n\nExample for a local tool:\n{\n  "mcpServers": {\n    "my-local-tool": {\n      "command": "npx",\n      "args": ["-y", "@example/server"]\n    }\n  }\n}\n\nExample for a remote tool:\n{\n  "mcpServers": {\n    "my-remote-tool": {\n      "url": "http://127.0.0.1:8000/sse"\n    }\n  }\n}\n\nEnter JSON configuration:',
			data: {step: 'name_or_json'},
		};
	}

	/**
	 * Handles the /server connect subcommand.
	 * @param args - Array where args[0] is the server name
	 * @returns A CommandResult with connection status
	 */
	private async handleServerConnectCommand(
		args: string[],
	): Promise<CommandResult> {
		if (args.length === 0) {
			const configuredServers = Object.keys(
				this.mcpConfigService.getConfiguredServers(),
			);
			if (configuredServers.length === 0) {
				return {
					type: 'error',
					message:
						'No servers configured. Use /server add to configure servers first.\n\nUsage: /server connect <server_name>',
				};
			}
			return {
				type: 'error',
				message: `Usage: /server connect <server_name>\n\nConfigured servers: ${configuredServers.join(
					', ',
				)}`,
			};
		}

		const serverName = args[0];
		if (!serverName) {
			return {
				type: 'error',
				message:
					'Server name is required.\n\nUsage: /server connect <server_name>',
			};
		}

		// Get the server configuration
		const serverConfig = this.mcpConfigService.getServerConfig(serverName);
		if (!serverConfig) {
			return {
				type: 'error',
				message: `Server "${serverName}" is not configured.`,
			};
		}

		// Check if already connected
		if (this.agentService.isServerConnected(serverName)) {
			return {
				type: 'info',
				message: `Server "${serverName}" is already connected.`,
			};
		}

		try {
			// Get current sessions and add the new server
			await this.agentService.connectServer(serverName, serverConfig);

			return {
				type: 'success',
				message: `Connected to server "${serverName}"!`,
				data: {reinitializeAgent: true},
			};
		} catch (error) {
			Logger.error(`Failed to connect to server ${serverName}`, {
				error: error instanceof Error ? error.message : String(error),
			});
			if (error instanceof Error && error.message.includes('40')) {
				return {
					type: 'error',
					message: `Failed to connect to server "${serverName}": ${
						error instanceof Error ? error.message : 'Unknown error'
					}. \n\nIf your server uses streamableHttp, it did not work because our TS library does not support it yet. 
						\nIf you'd like us to implement this as soon as possible, please let us know at https://mcp-use.com/what-should-we-build-next`,
				};
			}
			return {
				type: 'error',
				message: `Failed to connect to server "${serverName}": ${
					error instanceof Error ? error.message : 'Unknown error'
				}`,
			};
		}
	}

	/**
	 * Handles the /server disconnect subcommand.
	 * @param args - Array where args[0] is the server name
	 * @returns A CommandResult with disconnection status
	 */
	private async handleServerDisconnectCommand(
		args: string[],
	): Promise<CommandResult> {
		if (args.length === 0) {
			const connectedServers = this.agentService.getConnectedServerNames();
			if (connectedServers.length === 0) {
				return {
					type: 'info',
					message:
						'No servers currently connected.\n\nUsage: /server disconnect <server_name>',
				};
			}
			return {
				type: 'error',
				message: `Usage: /server disconnect <server_name>\n\nConnected servers: ${connectedServers.join(
					', ',
				)}`,
			};
		}

		const serverName = args[0];
		if (!serverName) {
			return {
				type: 'error',
				message:
					'Server name is required.\n\nUsage: /server disconnect <server_name>',
			};
		}

		try {
			await this.agentService.disconnectServer(serverName);
			await this.initializeAgent();

			return {
				type: 'server_action',
				message: `Disconnected from server: ${serverName}`,
				data: {
					reinitializeAgent: true,
					serverName,
					action: 'disconnect',
				},
			};
		} catch (error) {
			return {
				type: 'error',
				message: `Failed to disconnect from ${serverName}: ${
					error instanceof Error ? error.message : 'Unknown error'
				}`,
			};
		}
	}

	/**
	 * Gets command suggestions based on the user's input.
	 * It can suggest commands, subcommands, or arguments.
	 * @param text The full input string from the user.
	 * @returns A promise that resolves to an array of suggestion strings.
	 */
	public async getSuggestions(text: string): Promise<string[]> {
		const parts = text.trim().split(/\s+/);
		const commandName = parts[0] || '';

		// If there's no space, suggest top-level commands that are not subcommands
		if (!text.includes(' ')) {
			return [...this.commandRegistry.keys()].filter(
				c => c.startsWith(commandName) && !c.includes(' '),
			);
		}

		const getPotentialCommands = (
			input: string,
		): Array<{
			cmd: string;
			entry: CommandRegistryEntry;
			args: string[];
		}> => {
			const result: Array<{
				cmd: string;
				entry: CommandRegistryEntry;
				args: string[];
			}> = [];
			const ps = input.trim().split(' ');
			// Check for command with subcommand
			if (ps.length >= 2) {
				const twoPartCmd = `${ps[0]} ${ps[1]}`;
				if (this.commandRegistry.has(twoPartCmd)) {
					result.push({
						cmd: twoPartCmd,
						entry: this.commandRegistry.get(twoPartCmd)!,
						args: ps.slice(2),
					});
				}
			}
			// Check for base command
			if (this.commandRegistry.has(ps[0]!)) {
				result.push({
					cmd: ps[0]!,
					entry: this.commandRegistry.get(ps[0]!)!,
					args: ps.slice(1),
				});
			}
			return result;
		};

		const potentialCommands = getPotentialCommands(text);
		if (potentialCommands.length === 0) {
			return [];
		}

		// Prioritize longer command matches (subcommands)
		const {entry, args} =
			potentialCommands.length > 1 &&
			potentialCommands[0]!.cmd.length > potentialCommands[1]!.cmd.length
				? potentialCommands[0]!
				: potentialCommands.at(-1)!;

		if (entry.getSuggestions) {
			const suggestions = await entry.getSuggestions(args);
			const lastArg = text.endsWith(' ') ? '' : args.at(-1) || '';
			const filtered = suggestions.filter(s => s.startsWith(lastArg));
			const baseCommand = text.endsWith(' ')
				? text
				: text.slice(0, -lastArg.length);
			return filtered.map(s => `${baseCommand}${s}`);
		}

		return [];
	}

	/**
	 * Returns the command registry.
	 * @returns The map of registered commands
	 */
	getCommandRegistry(): Map<string, CommandRegistryEntry> {
		return this.commandRegistry;
	}
}

// Export a singleton instance
export const cliService = new CLIService();
