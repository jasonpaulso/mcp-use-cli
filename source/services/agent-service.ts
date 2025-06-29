import { MCPAgent, MCPClient } from 'mcp-use';
import { Logger } from '../logger.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { ToolCall } from '../types.js';
import { LLMService } from './llm-service.js';
import { MCPConfigService } from './mcp-config-service.js';

export interface AgentServiceDeps {
	llmService: LLMService;
	mcpConfigService: MCPConfigService;
}

export class AgentService {
	private agent: MCPAgent | null = null;
	private client: MCPClient | null = null;
	private llmService: LLMService;
	private mcpConfigService: MCPConfigService;

	constructor(deps: AgentServiceDeps) {
		this.llmService = deps.llmService;
		this.mcpConfigService = deps.mcpConfigService;
	}

	public async initializeAgent() {
		const llm = this.llmService.createLLM();
		const sessionServers = this.mcpConfigService.getSessionServers();

		if (!llm) {
			this.agent = null;
			this.client = null;
			Logger.info('LLM not provided, skipping agent initialization.');
			return;
		}

		try {
			const config = {
				mcpServers: {
					...sessionServers,
				},
			};
			Logger.info('Initializing MCP client with config', { config });
			this.client = new MCPClient(config);

			this.agent = new MCPAgent({
				llm,
				client: this.client,
				maxSteps: 15,
				memoryEnabled: true, // Enable built-in conversation memory
			});

			Logger.info('Initializing MCP agent...');
			await this.agent.initialize();
			Logger.info('MCP agent initialized successfully');
		} catch (error) {
			Logger.error('Failed to initialize agent', {
				error: error instanceof Error ? error.message : String(error),
			});
			this.agent = null;
			this.client = null;
			// Re-throw to allow the caller to handle it
			throw error;
		}
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
				const agentStep: any = result.value; // This is of type AgentStep

				if (agentStep.action) {
					// The 'log' contains the "Thought:" part.
					if (agentStep.action.log) {
						yield { thought: agentStep.action.log };
					}
					// Map AgentStep to our internal ToolCall type
					const toolCall: ToolCall = {
						id: `${agentStep.action.tool}-${Date.now()}`, // Create a simple unique ID
						role: 'tool',
						tool_name: agentStep.action.tool,
						tool_input: agentStep.action.toolInput,
						tool_output: agentStep.observation,
					};

					yield { toolCalls: [toolCall] };
				}
				result = await generator.next();
			}

			// When the generator is done, the final response is in result.value
			const finalResponse: string = result.value;
			if (finalResponse) {
				yield { response: finalResponse };
			}
		} catch (error) {
			Logger.error('Error sending message to MCP agent', {
				error: error instanceof Error ? error.message : 'Unknown error',
				stack: error instanceof Error ? error.stack : undefined,
			});
			throw error;
		}
	}

	async getAvailableTools(): Promise<{ tools: Tool[]; error?: string }> {
		Logger.debug('Getting available tools - starting check');

		if (!this.client) {
			const error = 'No agent/client initialized';
			Logger.warn('Tools check failed - no client', { error });
			return { tools: [], error };
		}

		try {
			let allTools: Tool[] = [];
			const sessions = this.client.getAllActiveSessions();

			// Iterate through sessions to get tools
			for (const [sessionName, session] of Object.entries(sessions)) {
				if (session.connector?.tools && Array.isArray(session.connector.tools)) {
					Logger.debug(`Found tools in connector for session ${sessionName}`, {
						toolCount: session.connector.tools.length,
					});
					const sessionTools = session.connector.tools.map((tool: any) => ({
						...tool,
						session: sessionName,
					}));
					allTools.push(...sessionTools);
				}
			}
			return { tools: allTools };
		} catch (error) {
			const errorMsg = `Failed to get tools: ${error instanceof Error ? error.message : 'Unknown error'
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
}
