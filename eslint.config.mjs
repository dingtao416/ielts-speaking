import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // 服务端路由 / Web Speech API 的错误捕获用 any 是惯常做法
      "@typescript-eslint/no-explicit-any": "off",
      // 计时器、Web Speech 等外部系统订阅需要 effect 内 setState / ref 写入
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/refs": "off",
      // 下划线前缀参数表示"有意不用"（如保留函数签名）
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
