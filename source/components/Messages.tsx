import {CommandMessage, ToolCall} from '../types.js';
import {Message} from '../types.js';
import React from 'react';

import {Box, Text} from 'ink';

export const UserMessageRenderer = ({message}: {message: Message}) => {
	return (
		<>
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
	);
};

export const AssistantMessageRenerer = ({message}: {message: Message}) => {
	return (
		<>
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
		</>
	);
};

export const ToolCallRenderer = ({message}: {message: ToolCall}) => {
	return (
		<>
			<Box
				key={message.id}
				marginBottom={1}
				borderStyle={'round'}
				flexDirection="column"
				gap={1}
			>
				<Box marginRight={1}>
					<Text color={'white'} bold>
						🔨 Tool: {message.tool_name}
					</Text>
				</Box>
				<Box flexDirection="column" flexGrow={1}>
					<Text wrap="wrap"> Input: {message.tool_input.toString().slice(0, 50)} </Text>
					<Text wrap="wrap"> Output:{message.tool_output.toString().slice(0, 50)} </Text>
				</Box>
			</Box>
		</>
	);
};

export const CommandMessageRenderer = ({
	message,
}: {
	message: CommandMessage;
}) => {
	const {commandResult} = message;
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

	return (
		<>
			<Box key={message.id} marginBottom={1}>
				<Box marginRight={1}>
					<Text color={color} bold>
						{icon}
					</Text>
				</Box>
				<Box flexDirection="column" flexGrow={1}>
					<Text wrap="wrap" color={color}>
						{message.content}
					</Text>
				</Box>
			</Box>
		</>
	);
};

export const MessageRenderer = ({
	message,
}: {
	message: Message | ToolCall | CommandMessage;
}) => {
	switch (message.role) {
		case 'tool':
			return <ToolCallRenderer message={message as ToolCall} />;
		case 'user':
			return <UserMessageRenderer message={message as Message} />;
		case 'assistant':
			return <AssistantMessageRenerer message={message as Message} />;
		case 'command':
			return <CommandMessageRenderer message={message as CommandMessage} />;
		default:
			return null;
	}
};
