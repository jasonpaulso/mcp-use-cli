import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import BigText from 'ink-big-text';
import { mcpService } from './services/mcp-service.js';
import { Logger } from './logger.js';
import { InputPrompt } from './components/InputPrompt.js';
import Spinner from './components/Spinner.js';
import AsciiLogo from './components/AsciiLogo.js';
import { CommandMessage } from './types.js';
import { ToolCall } from './types.js';
import { Message } from './types.js';
import { MessageRenderer } from './components/Messages.js';


export default function App() {
	const [messages, setMessages] = useState<
		(Message | ToolCall | CommandMessage)[]
	>([]);
	const [input, setInput] = useState('');
	const [isLoading, setIsLoading] = useState(false);
	const [showInput, setShowInput] = useState(false);
	const [initializationError, setInitializationError] = useState<string>('');
	const [currentModel, setCurrentModel] =
		useState<string>('openai/gpt-4o-mini');
	const [connectedServers, setConnectedServers] = useState<string[]>([]);
	const [isWaitingForApiKey, setIsWaitingForApiKey] = useState(false);
	const [pendingProvider, setPendingProvider] = useState<string>('');
	const [pendingModel, setPendingModel] = useState<string>('');
	const [isWaitingForServerConfig, setIsWaitingForServerConfig] =
		useState(false);
	const [serverConfigStep, setServerConfigStep] = useState<string>('');
	const [currentServerConfig, setCurrentServerConfig] = useState<any>(null);
	const [inputHistory, setInputHistory] = useState<string[]>([]);
	const [historyIndex, setHistoryIndex] = useState<number>(-1);
	const [tempInput, setTempInput] = useState<string>('');
	const { stdout } = useStdout();

	// Initialize MCP service on component mount
	useEffect(() => {
		const initializeMCP = async () => {
			try {
				Logger.info('Initializing MCP service...');
				setIsLoading(true);
				await mcpService.initialize();
				const model = mcpService.getCurrentModel();
				const servers = mcpService.getConnectedServers();

				Logger.info('MCP service initialized successfully', {
					model,
					connectedServers: servers,
				});

				setCurrentModel(model);
				setConnectedServers(servers);
				setShowInput(true);
			} catch (error) {
				const errorMsg =
					error instanceof Error
						? error.message
						: 'Failed to initialize MCP service';
				Logger.error('MCP initialization failed', {
					error: errorMsg,
					stack: error instanceof Error ? error.stack : undefined,
				});
				setInitializationError(errorMsg);
			} finally {
				setIsLoading(false);
			}
		};

		initializeMCP();
	}, []);

	// Handle keyboard shortcuts
	useInput((inputChar, key) => {
		if (key.ctrl && inputChar === 'c') {
			process.exit(0);
		}
		if (key.ctrl && inputChar === 'd') {
			process.exit(0);
		}
	});

	// History navigation callbacks
	const handleHistoryUp = useCallback(() => {
		Logger.debug('History up requested', {
			historyIndex,
			historyLength: inputHistory.length,
		});

		if (inputHistory.length === 0) return;

		// If we're at the bottom of history, save current input
		if (historyIndex === -1) {
			setTempInput(input);
		}

		// Move up in history
		const newIndex = Math.min(historyIndex + 1, inputHistory.length - 1);
		if (newIndex !== historyIndex) {
			setHistoryIndex(newIndex);
			const historyItem = inputHistory[inputHistory.length - 1 - newIndex];
			if (historyItem !== undefined) {
				setInput(historyItem);
			}
		}
	}, [
		historyIndex,
		inputHistory,
		input,
		setInput,
		setHistoryIndex,
		setTempInput,
	]);

	const handleHistoryDown = useCallback(() => {
		Logger.debug('History down requested', {
			historyIndex,
			historyLength: inputHistory.length,
		});

		if (historyIndex === -1) return;

		// Move down in history
		const newIndex = historyIndex - 1;
		if (newIndex === -1) {
			// Back to current input
			setHistoryIndex(-1);
			setInput(tempInput);
		} else {
			setHistoryIndex(newIndex);
			const historyItem = inputHistory[inputHistory.length - 1 - newIndex];
			if (historyItem !== undefined) {
				setInput(historyItem);
			}
		}
	}, [historyIndex, inputHistory, tempInput, setInput, setHistoryIndex]);

	// Handle submit of commands
	const handleSubmit = async (userInput: string) => {
		if (!userInput.trim()) return;

		// Add input to history (avoid duplicates and empty strings)
		const trimmedInput = userInput.trim();
		if (
			trimmedInput &&
			(inputHistory.length === 0 ||
				inputHistory[inputHistory.length - 1] !== trimmedInput)
		) {
			setInputHistory(prev => [...prev, trimmedInput]);
		}

		// Reset history navigation
		setHistoryIndex(-1);
		setTempInput('');

		Logger.debug('User input received', {
			input: trimmedInput,
			isWaitingForApiKey,
			isWaitingForServerConfig,
			historyLength: inputHistory.length + 1,
		});

		// Check if we're waiting for server configuration input
		if (isWaitingForServerConfig) {
			Logger.debug('Processing server config input', { step: serverConfigStep });

			const userMessage: Message = {
				id: Date.now().toString(),
				role: 'user',
				content: trimmedInput,
				timestamp: new Date(),
			};

			setMessages(prev => [...prev, userMessage]);
			setInput('');
			setIsLoading(true);

			try {
				// Import CommandHandler to access handleServerConfigInput
				const result = await mcpService.sendMessage(
					trimmedInput,
					false,
					'',
					'',
					true,
					serverConfigStep,
					currentServerConfig,
				);

				Logger.debug('Server config result received', { result });

				if (result.commandResult) {
					// Check if we're continuing server config or done
					if (
						result.commandResult.type === 'prompt_server_config' &&
						result.commandResult.data
					) {
						setServerConfigStep(result.commandResult.data.step);
						setCurrentServerConfig(result.commandResult.data.config);
					} else {
						// Server config is done
						setIsWaitingForServerConfig(false);
						setServerConfigStep('');
						setCurrentServerConfig(null);

						// Update connected servers if servers were connected or disconnected
						if (result.commandResult.data?.reinitializeAgent) {
							await mcpService.initializeAgent();
							setConnectedServers(mcpService.getConnectedServers());
						}
					}
					const commandMessage: CommandMessage = {
						id: (Date.now() + 1).toString(),
						role: 'command',
						content: result.response,
						commandResult: result.commandResult,
						timestamp: new Date(),
					};

					setMessages(prev => [...prev, commandMessage]);
				}

				setIsLoading(false);
			} catch (error) {
				Logger.error('Server config error', {
					error: error instanceof Error ? error.message : 'Unknown error',
					stack: error instanceof Error ? error.stack : undefined,
				});

				const errorMessage: Message = {
					id: (Date.now() + 1).toString(),
					role: 'assistant',
					content: `Error: ${error instanceof Error ? error.message : 'Unknown error'
						}`,
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
			Logger.debug('Processing API key input', {
				provider: pendingProvider,
				model: pendingModel,
			});

			const maskedInput = trimmedInput.replace(/./g, '*');
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
				const result = await mcpService.sendMessage(
					trimmedInput.trim(),
					true,
					pendingProvider,
					pendingModel,
				);

				Logger.debug('API key result received', {
					success: !!result.commandResult?.data?.llmConfig,
				});

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
				Logger.error('API key error', {
					error: error instanceof Error ? error.message : 'Unknown error',
					stack: error instanceof Error ? error.stack : undefined,
				});

				const errorMessage: Message = {
					id: (Date.now() + 1).toString(),
					role: 'assistant',
					content: `Error: ${error instanceof Error ? error.message : 'Unknown error'
						}`,
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

		Logger.debug('Processing regular message');

		const userMessage: Message = {
			id: Date.now().toString(),
			role: 'user',
			content: trimmedInput,
			timestamp: new Date(),
		};

		setMessages(prev => [...prev, userMessage]);
		setInput('');
		setIsLoading(true);

		try {
			const result = await mcpService.sendMessage(trimmedInput);

			Logger.debug('Message result received', {
				isCommand: result.isCommand,
				hasCommandResult: !!result.commandResult,
				toolCallsCount: result.toolCalls?.length || 0,
			});

			if (result.isCommand && result.commandResult) {
				// Check if we need to prompt for API key
				if (result.commandResult.data?.reinitializeAgent) {
					await mcpService.initializeAgent();
					setConnectedServers(mcpService.getConnectedServers());
				}

				// Check if we need to prompt for API key
				if (
					result.commandResult.type === 'prompt_key' &&
					result.commandResult.data
				) {
					setIsWaitingForApiKey(true);
					setPendingProvider(result.commandResult.data.provider);
					setPendingModel(result.commandResult.data.model);
				} else if (
					result.commandResult.type === 'prompt_server_config' &&
					result.commandResult.data
				) {
					setIsWaitingForServerConfig(true);
					setServerConfigStep(result.commandResult.data.step);
					setCurrentServerConfig(result.commandResult.data.config || null);
				} else if (result.commandResult.data?.hasOwnProperty('llmConfig')) {
					// Update current model if it changed (including null for clearkeys)
					setCurrentModel(mcpService.getCurrentModel());
				}
				const commandMessage: CommandMessage = {
					id: (Date.now() + 1).toString(),
					role: 'command',
					content: result.response,
					commandResult: result.commandResult,
					timestamp: new Date(),
				};
				setMessages(prev => [...prev, commandMessage]);
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
			Logger.error('Message processing error', {
				error: error instanceof Error ? error.message : 'Unknown error',
				stack: error instanceof Error ? error.stack : undefined,
			});

			const errorMessage: Message = {
				id: (Date.now() + 1).toString(),
				role: 'assistant',
				content: `Error: ${error instanceof Error ? error.message : 'Unknown error'
					}`,
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
						<AsciiLogo />
						<Text color="gray">Model: {currentModel}</Text>
					</Box>
					<Box flexDirection="row" justifyContent="flex-start" width="100%">
						<Text color="gray">
							Connected servers:{' '}
							{connectedServers.length > 0
								? connectedServers.join(', ')
								: 'none'}
						</Text>
					</Box>
				</Box>
			</Box>

			<Box flexDirection="column" flexGrow={1} paddingX={1}>
				{initializationError && (
					<Box marginBottom={1}>
						<Text color="red">❌ {initializationError}</Text>
					</Box>
				)}

				{!initializationError && messages.length === 0 && !isLoading && (
					<Box marginBottom={1} flexDirection="column">
						<BigText text="MCP USE CLI" colors={['white']} />
						<Text color="gray">Welcome to MCP-Use CLI!</Text>
						{currentModel.includes('No') ? (
							<Box flexDirection="column">
								<Text color="yellow">⚠️ {currentModel}</Text>
								<Text color="gray">
									Choose a model to get started - the CLI will help you set up
									the API key.
								</Text>
								<Text color="cyan">💡 Try: /model openai gpt-4o-mini</Text>
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
									Use slash commands like /help, /model, or /status for
									configuration.
								</Text>
							</Box>
						)}
					</Box>
				)}

				{!initializationError && messages.length === 0 && isLoading && (
					<Box marginBottom={1}>
						<Text color="blue">🔄 Initializing MCP service...</Text>
					</Box>
				)}

				{messages.map(message => (
					<MessageRenderer message={message}></MessageRenderer>
				))}
				{isLoading && (
					<Box marginBottom={1}>
						<Box marginRight={1}>
							<Text color="blue">
								<Spinner type="mindblown" />
							</Text>
						</Box>
						<Text color="gray">Thinking...</Text>
					</Box>
				)}
			</Box>

			{showInput && !initializationError && (
				<Box flexDirection="column" marginTop={1} paddingX={1}>
					<Box
						borderStyle="round"
						borderColor={
							isWaitingForApiKey
								? 'yellow'
								: isWaitingForServerConfig
									? 'blue'
									: 'gray'
						}
						paddingX={1}
						paddingY={1}
						minHeight={3}
					>
						<Box flexDirection="row" width="100%">
							<Box marginRight={1} alignSelf="flex-start" flexShrink={0}>
								<Text
									color={
										isWaitingForApiKey
											? 'yellow'
											: isWaitingForServerConfig
												? 'blue'
												: 'green'
									}
									bold
								>
									{isWaitingForApiKey
										? '🔑'
										: isWaitingForServerConfig
											? '🔧'
											: '❯'}
								</Text>
							</Box>
							<Box flexGrow={1}>
								<InputPrompt
									value={input}
									onChange={setInput}
									onSubmit={handleSubmit}
									onHistoryUp={handleHistoryUp}
									onHistoryDown={handleHistoryDown}
									placeholder={
										isWaitingForApiKey
											? `Enter ${pendingProvider.toUpperCase()} API key...`
											: isWaitingForServerConfig
												? 'Enter server configuration...'
												: 'Type your message...'
									}
									mask={isWaitingForApiKey ? '*' : undefined}
								/>
							</Box>
						</Box>
					</Box>
				</Box>
			)}
			<Box borderStyle="round" borderColor="blue" paddingX={1} minWidth={25}>
				<Text color="blue" bold>
					🤖 {currentModel.replace('/', ' ')}
				</Text>
			</Box>
		</Box>
	);
}
