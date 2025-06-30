import tseslint from 'typescript-eslint';
import prettierConfig from 'eslint-plugin-prettier/recommended';

export default tseslint.config(
    ...tseslint.configs.recommended,
    prettierConfig,
); 