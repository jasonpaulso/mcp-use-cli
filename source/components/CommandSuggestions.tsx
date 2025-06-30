import React from 'react';
import {Box, Text} from 'ink';

interface CommandSuggestionsProps {
	suggestions: string[];
	query: string;
}

export function CommandSuggestions({
	suggestions,
	query,
}: CommandSuggestionsProps) {
	const filteredSuggestions = suggestions.filter(s => s.startsWith(query));

	if (filteredSuggestions.length === 0) {
		return null;
	}

	return (
		<Box flexDirection="column" marginTop={1}>
			<Box borderStyle="round" paddingX={1} flexDirection="column">
				<Text bold>SUGGESTIONS</Text>
				{filteredSuggestions.slice(0, 5).map(suggestion => (
					<Box key={suggestion}>
						<Text>{suggestion}</Text>
					</Box>
				))}
			</Box>
		</Box>
	);
}
