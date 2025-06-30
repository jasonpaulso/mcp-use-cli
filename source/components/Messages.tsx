import {CommandMessage, ToolCall} from '../types.js';
import {Message} from '../types.js';
import React from 'react';
import {Box, Text} from 'ink';
import {ServerStatus} from './ServerStatus.js';
import {ToolStatus} from './ToolStatus.js';

export const UserMessageRenderer = ({message}: {message: Message}) => {
	return (
		<Box key={message.id} marginBottom={1} flexDirection="row">
			<Box marginRight={1}>
				<Text color="white" bold>
					●
				</Text>
			</Box>
			<Box flexDirection="column" flexGrow={1}>
				<Text wrap="wrap">{message.content}</Text>
			</Box>
		</Box>
	);
};

export const AssistantMessageRenerer = ({message}: {message: Message}) => {
	return (
		<Box key={message.id} marginBottom={1} flexDirection="row">
			<Box marginRight={1}>
				<Text color="blue" bold>
					●
				</Text>
			</Box>
			<Box flexDirection="column" flexGrow={1}>
				<Text wrap="wrap">{message.content}</Text>
			</Box>
		</Box>
	);
};

export const ThoughtMessageRenderer = ({message}: {message: Message}) => {
	return (
		<Box key={message.id} flexDirection="row">
			<Box flexDirection="column" marginRight={1} flexGrow={1}>
				<Text color="gray" italic>
					{message.content}
				</Text>
			</Box>
		</Box>
	);
};

export const ToolCallRenderer = ({message}: {message: ToolCall}) => {
	const input = JSON.stringify(message.tool_input);
	const output = JSON.stringify(message.tool_output);

	return (
		<Box key={message.id} flexDirection="row">
			<Box marginRight={1}>
				<Text color="white" bold>
					●
				</Text>
			</Box>
			<Box
				flexGrow={1}
				paddingX={1}
				borderStyle="round"
				borderColor="white"
				flexDirection="column"
			>
				<Text color="white" bold>
					Tool: {message.tool_name}
				</Text>
				<Text>
					Input: {input.length > 100 ? `${input.slice(0, 97)}...` : input}
				</Text>
				<Text>
					Output: {output.length > 100 ? `${output.slice(0, 97)}...` : output}
				</Text>
			</Box>
		</Box>
	);
};

export const CommandMessageRenderer = ({
	message,
}: {
	message: CommandMessage;
}) => {
	const {commandResult} = message;

	let color = 'magenta'; // Default for info/system
	if (commandResult.type === 'error') color = 'red';
	if (commandResult.type === 'success') color = 'green';
	if (
		commandResult.type === 'prompt_api_key' ||
		commandResult.type === 'prompt_server_config'
	) {
		color = 'yellow';
	}
	if (commandResult.type === 'list_servers') color = 'magenta';
	if (commandResult.type === 'list_tools') color = 'cyan';

	return (
		<Box key={message.id} marginBottom={1} flexDirection="row">
			<Box marginRight={1}>
				<Text color={color} bold>
					●
				</Text>
			</Box>
			<Box flexDirection="column" flexGrow={1}>
				<Text>{message.content}</Text>
				{commandResult.type === 'list_servers' &&
					commandResult.data?.servers && (
						<ServerStatus servers={commandResult.data.servers} />
					)}
				{commandResult.type === 'list_tools' && commandResult.data && (
					<ToolStatus
						tools={commandResult.data.tools}
						error={commandResult.data.error}
					/>
				)}
			</Box>
		</Box>
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
		case 'thought':
			return <ThoughtMessageRenderer message={message as Message} />;
		case 'command':
			return <CommandMessageRenderer message={message as CommandMessage} />;
		default:
			return null;
	}
};
