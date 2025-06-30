import React from 'react';
import {Box, Text} from 'ink';
import type {CommandRegistryEntry} from '../services/cli-service.js';

interface CommandSuggestionsProps {
	suggestions: Array<[string, CommandRegistryEntry]>;
	query: string;
}

export function CommandSuggestions({
	suggestions,
	query,
}: CommandSuggestionsProps) {
	const filteredSuggestions = suggestions.filter(([command]) =>
		command.startsWith(query),
	);

	if (filteredSuggestions.length === 0) {
		return null;
	}

	return (
		<Box flexDirection="column" marginTop={1}>
			<Box borderStyle="round" paddingX={1} flexDirection="column">
				<Text bold>COMMANDS</Text>
				{filteredSuggestions.map(([command, {description}]) => (
					<Box key={command} flexDirection="row">
						<Box width={20}>
							<Text>{command}</Text>
						</Box>
						<Text>{description}</Text>
					</Box>
				))}
			</Box>
		</Box>
	);
}
