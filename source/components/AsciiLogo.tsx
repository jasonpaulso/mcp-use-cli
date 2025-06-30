import {Box, Text} from 'ink';
import Gradient from 'ink-gradient';
export const AsciiLogoContent = `
███╗   ███╗  ██████╗ ██████╗      ██╗   ██╗ ███████╗ ███████╗      ██████╗ ██╗      ██╗
████╗ ████║ ██╔════╝ ██╔══██╗     ██║   ██║ ██╔════╝ ██╔════╝     ██╔════╝ ██║      ██║
██╔████╔██║ ██║      ██████╔╝     ██║   ██║ ███████╗ █████╗       ██║      ██║      ██║
██║╚██╔╝██║ ██║      ██╔═══╝      ██║   ██║ ╚════██║ ██╔══╝       ██║      ██║      ██║
██║ ╚═╝ ██║ ╚██████╗ ██║          ╚██████╔╝ ███████║ ███████╗     ╚██████╗ ███████╗ ██║
╚═╝     ╚═╝  ╚═════╝ ╚═╝           ╚═════╝  ╚══════╝ ╚══════╝      ╚═════╝ ╚══════╝ ╚═╝
Vice CLI
  `;

export const AsciiLogo: React.FC = () => {
	return (
		<Box marginBottom={1} alignItems="flex-start" flexShrink={0}>
			<Gradient name="vice">
				<Text>{AsciiLogoContent}</Text>
			</Gradient>
		</Box>
	);
};
