import React, { useState, useEffect } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import TextInput from 'ink-text-input';
import BigText from 'ink-big-text';
import { mcpService, MCPMessage, MCPToolCall } from './mcp-service.js';
import { CommandResult } from './commands.js';

type Message = MCPMessage;
type ToolCall = MCPToolCall;

type CommandMessage = {
	id: string;
	role: 'command';
	content: string;
	commandResult: CommandResult;
	timestamp: Date;
};


const MessageRenderer = ({ message }: { message: Message | ToolCall | CommandMessage }) => {
	switch (message.role) {
		case "tool":
			return <ToolCallRenderer message={message as ToolCall} />
		case "user":
			return <UserMessageRenderer message={message as Message} />
		case "assistant":
			return <AssistantMessageRenerer message={message as Message} />
		case "command":
			return <CommandMessageRenderer message={message as CommandMessage} />
		default:
			return null;
	}
}
const UserMessageRenderer = ({ message }: { message: Message }) => {
	return <>
		<Box key={message.id} marginBottom={1}>
			<Box marginRight={1}>
				<Text color={'green'} bold>
					'❯'
				</Text>
			</Box>
			<Box flexDirection="column" flexGrow={1}>
				<Text wrap="wrap">{message.content}</Text>
			</Box>
		</Box>
	</>
}

const AssistantMessageRenerer = ({ message }: { message: Message }) => {
	return (<>
		<Box key={message.id} marginBottom={1}>
			<Box marginRight={1}>
				<Text color={'blue'} bold>
					'◦'
				</Text>
			</Box>
			<Box flexDirection="column" flexGrow={1}>
				<Text wrap="wrap">{message.content}</Text>
			</Box>
		</Box>
	</>)
}


const ToolCallRenderer = ({ message }: { message: ToolCall }) => {
	return <>
		<Box key={message.id} marginBottom={1} borderStyle={"round"} flexDirection='column' gap={1}>
			<Box marginRight={1}>
				<Text color={'white'} bold>
					🔨 Tool: {message.tool_name}
				</Text>
			</Box>
			<Box flexDirection="column" flexGrow={1}>
				<Text wrap="wrap"> Input: {message.tool_input.toString()} </Text>
				<Text wrap="wrap"> Output:{message.tool_output.toString()} </Text>

			</Box>
		</Box>
	</>
}

const CommandMessageRenderer = ({ message }: { message: CommandMessage }) => {
	const { commandResult } = message;
	let icon = '💻';
	let color = 'cyan';
	
	if (commandResult.type === 'error') {
		icon = '❌';
		color = 'red';
	} else if (commandResult.type === 'success') {
		icon = '✅';
		color = 'green';
	} else if (commandResult.type === 'prompt_key') {
		icon = '🔑';
		color = 'yellow';
	} else if (commandResult.type === 'prompt_server_config') {
		icon = '🔧';
		color = 'blue';
	}

	return <>
		<Box key={message.id} marginBottom={1}>
			<Box marginRight={1}>
				<Text color={color} bold>
					{icon}
				</Text>
			</Box>
			<Box flexDirection="column" flexGrow={1}>
				<Text wrap="wrap" color={color}>{message.content}</Text>
			</Box>
		</Box>
	</>
}

type Props = {
	name?: string;
};

export default function App({ name }: Props) {
	const [messages, setMessages] = useState<(Message | ToolCall | CommandMessage)[]>([]);
	const [input, setInput] = useState('');
	const [isLoading, setIsLoading] = useState(false);
	const [showInput, setShowInput] = useState(false);
	const [initializationError, setInitializationError] = useState<string>('');
	const [currentModel, setCurrentModel] = useState<string>('openai/gpt-4o-mini');
	const [connectedServers, setConnectedServers] = useState<string[]>([]);
	const [isWaitingForApiKey, setIsWaitingForApiKey] = useState(false);
	const [pendingProvider, setPendingProvider] = useState<string>('');
	const [pendingModel, setPendingModel] = useState<string>('');
	const [isWaitingForServerConfig, setIsWaitingForServerConfig] = useState(false);
	const [serverConfigStep, setServerConfigStep] = useState<string>('');
	const [currentServerConfig, setCurrentServerConfig] = useState<any>(null);
	const { stdout } = useStdout();

	// Initialize MCP service on component mount
	useEffect(() => {
		const initializeMCP = async () => {
			try {
				setIsLoading(true);
				await mcpService.initialize();
				setCurrentModel(mcpService.getCurrentModel());
				setConnectedServers(mcpService.getConnectedServers());
				setShowInput(true);
			} catch (error) {
				setInitializationError(error instanceof Error ? error.message : 'Failed to initialize MCP service');
			} finally {
				setIsLoading(false);
			}
		};

		initializeMCP();
	}, []);

	useInput((input, key) => {
		if (key.ctrl && input === 'c') {
			process.exit(0);
		}
		if (key.ctrl && input === 'd') {
			process.exit(0);
		}
	});

	const handleSubmit = async (userInput: string) => {
		if (!userInput.trim()) return;

		// Check if we're waiting for server configuration input
		if (isWaitingForServerConfig) {
			const userMessage: Message = {
				id: Date.now().toString(),
				role: 'user',
				content: userInput.trim(),
				timestamp: new Date(),
			};

			setMessages(prev => [...prev, userMessage]);
			setInput('');
			setIsLoading(true);

			try {
				// Import CommandHandler to access handleServerConfigInput
				const result = await mcpService.sendMessage(userInput.trim(), false, '', '', true, serverConfigStep, currentServerConfig);
				
				if (result.commandResult) {
					const commandMessage: CommandMessage = {
						id: (Date.now() + 1).toString(),
						role: 'command',
						content: result.response,
						commandResult: result.commandResult,
						timestamp: new Date(),
					};

					setMessages(prev => [...prev, commandMessage]);
					
					// Check if we're continuing server config or done
					if (result.commandResult.type === 'prompt_server_config' && result.commandResult.data) {
						setServerConfigStep(result.commandResult.data.step);
						setCurrentServerConfig(result.commandResult.data.config);
					} else {
						// Server config is done
						setIsWaitingForServerConfig(false);
						setServerConfigStep('');
						setCurrentServerConfig(null);
						
						// Update connected servers if servers were connected or disconnected
						if (result.commandResult.data?.serverConnected || result.commandResult.data?.serverDisconnected) {
							setConnectedServers(mcpService.getConnectedServers());
						}
					}
				}
				
				setIsLoading(false);
			} catch (error) {
				const errorMessage: Message = {
					id: (Date.now() + 1).toString(),
					role: 'assistant',
					content: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
					timestamp: new Date(),
				};

				setMessages(prev => [...prev, errorMessage]);
				setIsLoading(false);
				
				// Reset server config state on error
				setIsWaitingForServerConfig(false);
				setServerConfigStep('');
				setCurrentServerConfig(null);
			}
			return;
		}

		// Check if we're waiting for an API key
		if (isWaitingForApiKey) {
			const maskedInput = userInput.replace(/./g, '*');
			const userMessage: Message = {
				id: Date.now().toString(),
				role: 'user',
				content: maskedInput,
				timestamp: new Date(),
			};

			setMessages(prev => [...prev, userMessage]);
			setInput('');
			setIsLoading(true);

			try {
				const result = await mcpService.sendMessage(userInput.trim(), true, pendingProvider, pendingModel);
				
				if (result.commandResult) {
					const commandMessage: CommandMessage = {
						id: (Date.now() + 1).toString(),
						role: 'command',
						content: result.response,
						commandResult: result.commandResult,
						timestamp: new Date(),
					};

					setMessages(prev => [...prev, commandMessage]);
					
					// Update current model if successful
					if (result.commandResult.data?.llmConfig) {
						setCurrentModel(mcpService.getCurrentModel());
					}

					// Reset API key input state
					setIsWaitingForApiKey(false);
					setPendingProvider('');
					setPendingModel('');
				}
				
				setIsLoading(false);
			} catch (error) {
				const errorMessage: Message = {
					id: (Date.now() + 1).toString(),
					role: 'assistant',
					content: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
					timestamp: new Date(),
				};

				setMessages(prev => [...prev, errorMessage]);
				setIsLoading(false);
				
				// Reset API key input state on error
				setIsWaitingForApiKey(false);
				setPendingProvider('');
				setPendingModel('');
			}
			return;
		}

		const userMessage: Message = {
			id: Date.now().toString(),
			role: 'user',
			content: userInput.trim(),
			timestamp: new Date(),
		};

		setMessages(prev => [...prev, userMessage]);
		setInput('');
		setIsLoading(true);

		try {
			const result = await mcpService.sendMessage(userInput.trim());
			
			if (result.isCommand && result.commandResult) {
				// Handle command response
				const commandMessage: CommandMessage = {
					id: (Date.now() + 1).toString(),
					role: 'command',
					content: result.response,
					commandResult: result.commandResult,
					timestamp: new Date(),
				};

				setMessages(prev => [...prev, commandMessage]);
				
				// Check if we need to prompt for API key
				if (result.commandResult.type === 'prompt_key' && result.commandResult.data) {
					setIsWaitingForApiKey(true);
					setPendingProvider(result.commandResult.data.provider);
					setPendingModel(result.commandResult.data.model);
				} else if (result.commandResult.type === 'prompt_server_config' && result.commandResult.data) {
					setIsWaitingForServerConfig(true);
					setServerConfigStep(result.commandResult.data.step);
					setCurrentServerConfig(result.commandResult.data.config || null);
				} else if (result.commandResult.data?.serverConnected || result.commandResult.data?.serverDisconnected) {
					// Update connected servers if servers were connected or disconnected
					setConnectedServers(mcpService.getConnectedServers());
				} else if (result.commandResult.data?.hasOwnProperty('llmConfig')) {
					// Update current model if it changed (including null for clearkeys)
					setCurrentModel(mcpService.getCurrentModel());
				}
			} else {
				// Handle regular assistant response
				const assistantMessage: Message = {
					id: (Date.now() + 1).toString(),
					role: 'assistant',
					content: result.response,
					timestamp: new Date(),
				};

				// Add assistant message and any tool calls
				setMessages(prev => [...prev, assistantMessage, ...result.toolCalls]);
			}
			
			setIsLoading(false);
		} catch (error) {
			const errorMessage: Message = {
				id: (Date.now() + 1).toString(),
				role: 'assistant',
				content: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
				timestamp: new Date(),
			};

			setMessages(prev => [...prev, errorMessage]);
			setIsLoading(false);
		}
	};

	return (
		<Box flexDirection="column" minHeight={stdout.rows || 24}>
			<Box borderStyle="round" borderColor="blue" paddingX={1} marginBottom={1}>
				<Box flexDirection="column" width="100%">
					<Box flexDirection="row" justifyContent="space-between" width="100%">
						<Text color="blue" bold>
							MCP-Use CLI {name ? `- ${name}` : ' '} 
						</Text>
						<Text color="gray">
							Model: {currentModel}
						</Text>
					</Box>
					<Box flexDirection="row" justifyContent="flex-start" width="100%">
						<Text color="gray">
							Connected servers: {connectedServers.length > 0 ? connectedServers.join(', ') : 'none'}
						</Text>
					</Box>
				</Box>
			</Box>

			<Box flexDirection="column" flexGrow={1} paddingX={1}>
				{initializationError && (
					<Box marginBottom={1}>
						<Text color="red">
							❌ {initializationError}
						</Text>
					</Box>
				)}
				
				{!initializationError && messages.length === 0 && !isLoading && (
					<Box marginBottom={1} flexDirection="column">
						<BigText text="MCP USE CLI" colors={['white']} />
						<Text color="gray">
							Welcome to MCP-Use CLI!
						</Text>
						{currentModel.includes('No') ? (
							<Box flexDirection="column">
								<Text color="yellow">
									⚠️ {currentModel}
								</Text>
								<Text color="gray">
									Choose a model to get started - the CLI will help you set up the API key.
								</Text>
								<Text color="cyan">
									💡 Try: /model openai gpt-4o-mini
								</Text>
								<Text color="gray">
									Or use /models to see all options, /help for commands.
								</Text>
							</Box>
						) : (
							<Box flexDirection="column">
								<Text color="gray">
									Type your message and press Enter to start chatting.
								</Text>
								<Text color="gray">
									Use slash commands like /help, /model, or /status for configuration.
								</Text>
							</Box>
						)}
					</Box>
				)}

				{!initializationError && messages.length === 0 && isLoading && (
					<Box marginBottom={1}>
						<Text color="blue">
							🔄 Initializing MCP service...
						</Text>
					</Box>
				)}

				{messages.map(message => <MessageRenderer message={message}></MessageRenderer>)}
				{isLoading && (
					<Box marginBottom={1}>
						<Box marginRight={1}>
							<Text color="blue" bold>
								◦
							</Text>
						</Box>
						<Text color="gray">Thinking...</Text>
					</Box>
				)}
			</Box>

			{showInput && !initializationError && (
				<Box borderStyle="round" borderColor={isWaitingForApiKey ? "yellow" : isWaitingForServerConfig ? "blue" : "gray"} paddingX={1}>
					<Box marginRight={1}>
						<Text color={isWaitingForApiKey ? "yellow" : isWaitingForServerConfig ? "blue" : "green"} bold>
							{isWaitingForApiKey ? "🔑" : isWaitingForServerConfig ? "🔧" : "❯"}
						</Text>
					</Box>
					<TextInput
						value={input}
						onChange={setInput}
						onSubmit={handleSubmit}
						placeholder={
							isWaitingForApiKey 
								? `Enter ${pendingProvider.toUpperCase()} API key...` 
								: isWaitingForServerConfig 
									? "Enter server configuration..."
									: "Type your message..."
						}
						mask={isWaitingForApiKey ? "*" : undefined}
					/>
				</Box>
			)}
		</Box>
	);
}
