import React, {useState, useEffect, useCallback, useRef} from 'react';
import {Box, Text, useInput} from 'ink';

interface InputPromptProps {
	value: string;
	onChange: (value: string) => void;
	onSubmit: (value: string) => void;
	onHistoryUp?: () => void;
	onHistoryDown?: () => void;
	placeholder?: string;
	mask?: string;
	focus?: boolean;
}

export const InputPrompt: React.FC<InputPromptProps> = ({
	value,
	onChange,
	onSubmit,
	onHistoryUp,
	onHistoryDown,
	placeholder = 'Type your message...',
	mask,
	focus = true,
}) => {
	const [cursorPosition, setCursorPosition] = useState(value.length);
	const [isMultiline, setIsMultiline] = useState(false);
	const pasteBufferRef = useRef<string>('');
	const pasteTimeoutRef = useRef<NodeJS.Timeout | null>(null);
	const lastInputTimeRef = useRef<number>(Date.now());

	// Track if we should allow multiline
	useEffect(() => {
		setIsMultiline(value.includes('\n'));
	}, [value]);

	// Update cursor position when value changes externally
	useEffect(() => {
		setCursorPosition(value.length);
	}, [value]);

	const handleSubmit = useCallback(() => {
		const trimmedValue = value.trim();
		if (trimmedValue) {
			onSubmit(trimmedValue);
			onChange('');
			setCursorPosition(0);
			setIsMultiline(false);
		}
	}, [value, onSubmit, onChange]);

	const processPasteBuffer = useCallback(() => {
		if (pasteBufferRef.current) {
			const beforeCursor = value.slice(0, cursorPosition);
			const afterCursor = value.slice(cursorPosition);

			// Process the paste buffer to handle carriage returns
			let processedPaste = pasteBufferRef.current
				.replace(/\r\n/g, '\n')
				.replace(/\r/g, '\n');

			const newValue = beforeCursor + processedPaste + afterCursor;
			onChange(newValue);
			setCursorPosition(cursorPosition + processedPaste.length);

			if (processedPaste.includes('\n')) {
				setIsMultiline(true);
			}

			pasteBufferRef.current = '';
		}
	}, [value, cursorPosition, onChange]);

	useInput((input, key) => {
		if (!focus) return;

		const now = Date.now();
		const timeSinceLastInput = now - lastInputTimeRef.current;
		lastInputTimeRef.current = now;

		// Detect paste by checking if we're getting rapid inputs or multi-character input
		const isProbablyPaste =
			input &&
			(timeSinceLastInput < 50 || input.length > 1) &&
			!key.ctrl &&
			!key.meta;

		if (isProbablyPaste) {
			// Accumulate paste buffer
			pasteBufferRef.current += input;

			// Clear existing timeout
			if (pasteTimeoutRef.current) {
				clearTimeout(pasteTimeoutRef.current);
			}

			// Set new timeout to process paste
			pasteTimeoutRef.current = setTimeout(() => {
				processPasteBuffer();
				pasteTimeoutRef.current = null;
			}, 100);

			return;
		}

		// Process any pending paste buffer first
		if (pasteBufferRef.current) {
			processPasteBuffer();
		}

		// Submit on Enter (without modifiers)
		if (key.return && !key.ctrl && !key.meta && !key.shift) {
			handleSubmit();
			return;
		}

		// New line on Ctrl+Enter, Meta+Enter, or Shift+Enter
		if (key.return && (key.ctrl || key.meta || key.shift)) {
			const beforeCursor = value.slice(0, cursorPosition);
			const afterCursor = value.slice(cursorPosition);
			onChange(beforeCursor + '\n' + afterCursor);
			setCursorPosition(cursorPosition + 1);
			setIsMultiline(true);
			return;
		}

		// History navigation with up/down arrows (only in single-line mode)
		if (!isMultiline) {
			if (key.upArrow && onHistoryUp) {
				onHistoryUp();
				return;
			}
			if (key.downArrow && onHistoryDown) {
				onHistoryDown();
				return;
			}
		}

		// Backspace
		if (key.backspace || key.delete) {
			if (cursorPosition > 0) {
				const beforeCursor = value.slice(0, cursorPosition - 1);
				const afterCursor = value.slice(cursorPosition);
				onChange(beforeCursor + afterCursor);
				setCursorPosition(cursorPosition - 1);
			}
			return;
		}

		// Navigation keys
		if (key.leftArrow) {
			setCursorPosition(Math.max(0, cursorPosition - 1));
			return;
		}

		if (key.rightArrow) {
			setCursorPosition(Math.min(value.length, cursorPosition + 1));
			return;
		}

		// Home/End keys
		if (key.ctrl && input === 'a') {
			setCursorPosition(0);
			return;
		}

		if (key.ctrl && input === 'e') {
			setCursorPosition(value.length);
			return;
		}

		// Regular character input (not paste)
		if (input && !key.ctrl && !key.meta) {
			const beforeCursor = value.slice(0, cursorPosition);
			const afterCursor = value.slice(cursorPosition);

			// Process input to handle carriage returns
			const processedInput = input.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

			const newValue = beforeCursor + processedInput + afterCursor;
			onChange(newValue);
			setCursorPosition(cursorPosition + processedInput.length);

			if (processedInput.includes('\n')) {
				setIsMultiline(true);
			}
		}
	});

	// Render the input
	const renderContent = () => {
		if (!value && placeholder && !focus) {
			return <Text dimColor>{placeholder}</Text>;
		}

		let displayValue = mask ? value.replace(/./g, mask) : value;

		if (!isMultiline) {
			// Single line rendering with cursor
			const beforeCursor = displayValue.slice(0, cursorPosition);
			const atCursor = displayValue[cursorPosition] || ' ';
			const afterCursor = displayValue.slice(cursorPosition + 1);

			return (
				<Text>
					{beforeCursor}
					{focus && <Text inverse>{atCursor}</Text>}
					{afterCursor}
				</Text>
			);
		}

		// Multiline rendering
		const lines = displayValue.split('\n');
		let pos = 0;
		let cursorRow = 0;
		let cursorCol = 0;

		for (let row = 0; row < lines.length; row++) {
			const lineLength = lines[row]?.length || 0;
			if (pos + lineLength >= cursorPosition) {
				cursorRow = row;
				cursorCol = cursorPosition - pos;
				break;
			}
			pos += lineLength + 1; // +1 for newline
		}

		return lines.map((line, row) => {
			if (row === cursorRow && focus) {
				const before = line.slice(0, cursorCol);
				const at = line[cursorCol] || ' ';
				const after = line.slice(cursorCol + 1);

				return (
					<Box key={row}>
						<Text>
							{before}
							<Text inverse>{at}</Text>
							{after}
						</Text>
					</Box>
				);
			}

			return (
				<Box key={row}>
					<Text>{line || ' '}</Text>
				</Box>
			);
		});
	};

	return (
		<Box flexDirection="column" flexGrow={1}>
			{renderContent()}
			{isMultiline && focus && (
				<Box marginTop={1}>
					<Text dimColor italic>
						Enter to submit • Ctrl/Shift+Enter for new line
					</Text>
				</Box>
			)}
		</Box>
	);
};
