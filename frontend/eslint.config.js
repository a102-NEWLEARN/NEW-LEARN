import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig([
  // seed-design/ 은 SEED CLI 가 내려받는 컴포넌트라 손대지 않는다 (.prettierignore 와 같다)
  globalIgnores(["dist", "seed-design"]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
    ],
  },
]);
