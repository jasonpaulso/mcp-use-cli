#!/usr/bin/env node
import React from 'react';
import {render} from 'ink';
import meow from 'meow';
import App from './app.js';

const cli = meow(
	`
	Usage
	  $ mcp-use-cli

	Options
		--name        Your name (optional)
		--config      Path to MCP configuration file (optional)

	Examples
	  $ mcp-use-cli
	  $ mcp-use-cli --name=Jane
	  $ mcp-use-cli --config=./mcp-config.json

	Environment Variables
	  OPENAI_API_KEY    Required - Your OpenAI API key

	Setup
	  1. Set your OpenAI API key: export OPENAI_API_KEY=your_key_here
	  2. Run: mcp-use-cli
	  3. Start chatting with MCP servers!
`,
	{
		importMeta: import.meta,
		flags: {
			name: {
				type: 'string',
			},
			config: {
				type: 'string',
			},
		},
	},
);

render(<App name={cli.flags.name} />);
