import {Logger} from '../logger.js';
import {LLMService} from './llm-service.js';
import {MCPConfigService} from './mcp-config-service.js';

export interface AgentConfig {
	llm?: any;
	servers?: Record<string, any>;
}

export interface AgentServiceConfig {
	llmService: LLMService;
	mcpService: MCPConfigService;
}

export class AgentService {
	private llmService: LLMService;
	private mcpService: MCPConfigService;
	private agent: any = null;

	constructor(config: AgentServiceConfig) {
		this.llmService = config.llmService;
		this.mcpService = config.mcpService;
	}

	getAgent(): any {
		return this.agent;
	}

	setAgent(agent: any): void {
		this.agent = agent;
	}

	needsReinitialization(): boolean {
		return !this.agent || !this.llmService.getCurrentConfig();
	}

	getAgentConfig(): AgentConfig {
		const config: AgentConfig = {};

		// Get LLM configuration
		const llmConfig = this.llmService.getCurrentConfig();
		if (llmConfig) {
			try {
				config.llm = this.llmService.createLLM();
			} catch (error) {
				Logger.error('Failed to create LLM for agent', error);
				throw error;
			}
		}

		// Get MCP server configuration
		const sessionServers = this.mcpService.getSessionServers();
		if (Object.keys(sessionServers).length > 0) {
			config.servers = sessionServers;
		}

		return config;
	}

	async initializeAgent(
		createAgentFunction: (config: AgentConfig) => Promise<any>,
	): Promise<{success: boolean; message?: string}> {
		try {
			const config = this.getAgentConfig();

			if (!config.llm) {
				return {
					success: false,
					message:
						'No LLM configured. Use /model to select a provider and model.',
				};
			}

			this.agent = await createAgentFunction(config);

			return {
				success: true,
				message: 'Agent initialized successfully',
			};
		} catch (error) {
			Logger.error('Failed to initialize agent', error);
			return {
				success: false,
				message: `Failed to initialize agent: ${
					error instanceof Error ? error.message : 'Unknown error'
				}`,
			};
		}
	}

	async reinitializeAgent(
		createAgentFunction: (config: AgentConfig) => Promise<any>,
	): Promise<{success: boolean; message?: string}> {
		// Clear existing agent
		this.agent = null;

		// Reinitialize with current configuration
		return this.initializeAgent(createAgentFunction);
	}

	getStatus(): {
		hasAgent: boolean;
		hasLLM: boolean;
		llmInfo?: {provider: string; model: string};
		serverCount: number;
		connectedServers: string[];
	} {
		const llmConfig = this.llmService.getCurrentConfig();
		const sessionServers = this.mcpService.getSessionServers();

		return {
			hasAgent: !!this.agent,
			hasLLM: !!llmConfig,
			llmInfo: llmConfig
				? {provider: llmConfig.provider, model: llmConfig.model}
				: undefined,
			serverCount: Object.keys(sessionServers).length,
			connectedServers: Object.keys(sessionServers),
		};
	}

	async sendMessage(
		message: string,
		onChunk?: (chunk: string) => void,
	): Promise<{success: boolean; response?: string; error?: string}> {
		if (!this.agent) {
			return {
				success: false,
				error: 'Agent not initialized. Please configure a model first.',
			};
		}

		try {
			const response = await this.agent.sendMessage(message, {
				onChunk,
			});

			return {
				success: true,
				response,
			};
		} catch (error) {
			Logger.error('Failed to send message to agent', error);
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error',
			};
		}
	}

	async getAvailableTools(): Promise<string[]> {
		if (!this.agent) {
			return [];
		}

		try {
			const tools = await this.agent.getTools();
			return tools || [];
		} catch (error) {
			Logger.error('Failed to get available tools', error);
			return [];
		}
	}
}
