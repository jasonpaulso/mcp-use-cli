import {Box, Text} from 'ink';
import React from 'react';
import type {Tool} from '@modelcontextprotocol/sdk/types.js';

interface ToolStatusProps {
	tools: Tool[];
	error?: string;
}

export function ToolStatus({tools, error}: ToolStatusProps) {
	if (error) {
		return (
			<Box flexDirection="column" marginTop={1}>
				<Text color="red">❌ Error: {error}</Text>
				<Text>💡 This might indicate:</Text>
				<Box marginLeft={2} flexDirection="column">
					<Text>• MCP servers failed to start</Text>
					<Text>• Connection issues with configured servers</Text>
				</Box>
				<Text>Check console logs for more details.</Text>
			</Box>
		);
	}

	if (tools.length === 0) {
		return (
			<Box flexDirection="column" marginTop={1}>
				<Text color="white"> No MCP tools found</Text>
				<Text>
					{' '}
					Add tools from a server by running /server connect &lt;name&gt;
				</Text>
			</Box>
		);
	}

	return (
		<Box flexDirection="column" marginTop={1}>
			<Text color="green">Found {tools.length} MCP tools:</Text>
			{tools.map((tool, index) => (
				<Box key={tool.name} flexDirection="column" marginTop={1}>
					<Text>
						{index + 1}. <Text bold>{tool.name || 'Unknown'}</Text>
						{tool.description && `: ${tool.description}`}
					</Text>
				</Box>
			))}
		</Box>
	);
}
