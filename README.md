# 雅思口语训练系统 (IELTS Speaking Trainer)

基于历年真题训练雅思口语，AI 提炼答题框架，预测题背诵实践的一体化雅思口语备考工具。

## 核心闭环

```
真题题库 → 开口练习（实时词级分析 + AI 教练）→ 报告 → 自动提炼答题框架 → 素材本
                                                                        ↓
预测题库 ← 背诵实践（关键词提示卡）← 基于框架 ←──────────────────────────┘
```

- **真题训练**：从历年真题题库选一道题开口回答，实时识别并标记填充词、犹豫词、低分词、中式英语
- **框架提炼**：AI 基于回答自动提炼可复用的答题框架（结构/要点/高分表达），存入个人素材本
- **预测背诵**：临考切换到预测题库，用框架关键词提示卡背诵实践，考前内化输出

## 技术栈

| 层 | 技术 |
|---|---|
| 框架 | Next.js 16 (App Router) + React 19 + TypeScript + Tailwind CSS 4 |
| 认证 | better-auth 1.6.25（邮箱+密码 / 邮箱 OTP 验证码） |
| 数据库 | PostgreSQL 17 + drizzle-orm 0.45.2 + postgres.js |
| 语音识别 | Web Speech API（浏览器原生，Chrome/Edge） |
| AI 后端 | DeepSeek（服务端 Key，用户免配置），支持 OpenAI/自定义兼容端点 |
| 样式 | 黑白现代极简（白/灰底 + 黑字 + 大圆角），支持浅色/深色模式 |

## 环境要求

- **Node.js 22+**
- **PostgreSQL 17** 本机安装并运行（本机安装，非 Docker），5432 端口
- **Chrome / Edge**（Web Speech API 支持）
- 可选：`DEEPSEEK_API_KEY`（不配也能练，但报告/教练/AI 分析不可用）

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 准备数据库

本机 PostgreSQL 需已启动，创建 `ielts` 用户和数据库：

```bash
# 在 psql 里执行（或用你喜欢的方式）
CREATE ROLE ielts LOGIN PASSWORD 'ielts' SUPERUSER;
CREATE DATABASE ielts OWNER ielts;
```

> 连接默认 `postgresql://ielts:ielts@127.0.0.1:5432/ielts`（见 `src/config/database-url.ts`）。
> 若本机 PG 用其他端口/凭据，在 `.env.local` 里设 `DATABASE_URL`。

### 3. 配置环境

```bash
node scripts/prepare-env.mjs   # 生成 .env.local（含随机 BETTER_AUTH_SECRET）
```

编辑 `.env.local`，填入 DeepSeek Key（可选但推荐）：

```ini
DEEPSEEK_API_KEY=sk-xxxx
DEEPSEEK_MODEL=deepseek-chat
```

### 4. 初始化表结构

```bash
npm run db:generate   # 首次可选：生成迁移（已包含则跳过）
npm run db:migrate    # 应用迁移建表
```

### 5. 启动

```bash
npm run dev
# 打开 http://localhost:3000
```

### 测试账号（免注册直接登录）

内置测试账号，无需注册/邮箱验证：

| 用户名 | 密码 | 邮箱 |
|---|---|---|
| `root` | `12345678` | `root@ielts.local` |

创建测试账号：

```bash
npm run seed:test-user
```

## 常用脚本

| 命令 | 说明 |
|---|---|
| `npm run dev` | 开发服务器 |
| `npm run build` / `npm start` | 生产构建 / 启动 |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript 检查 |
| `npm run db:generate` / `db:migrate` / `db:studio` | Drizzle 迁移 / 可视化 |
| `npm run seed:test-user` | 创建测试账号 root / 12345678 |

## 本地 OTP 邮件说明

开发环境未配置 SMTP/Resend 时，注册/登录的邮箱验证码会**打印到服务端控制台**（`[IELTS Speaking development auth email]`）。生产部署需在 `.env.local` 配置完整的 SMTP 块或 Resend。

## 题库结构

`data/question-bank/` 下按 `real`（历年真题）/ `predicted`（预测题）组织：

```
data/question-bank/
├── real/index.json        # 历年真题（2023-2025，Part1/2/3）
└── predicted/index.json   # 预测题（2026，Part1/2/3）
```

每个条目：`{ year, part, topic, questions: [{ id, question, cueCard?, followUps? }] }`。
题库是静态 JSON，构建期导入，新增题目直接往文件里加即可。

## 目录结构

```
src/
├── app/
│   ├── page.tsx               # 落地页
│   ├── bank/                  # 题库浏览（公开）
│   ├── practice/[questionId]/ # 练习页（需登录）
│   ├── recite/[questionId]/   # 背诵页（需登录）
│   ├── library/               # 素材本（需登录）
│   ├── settings/              # 设置
│   └── api/                   # auth/llm/feedback/report/framework/frameworks/sessions
├── auth.ts / auth-client.ts   # better-auth 配置（抄自 FieldClose 项目）
├── persistence/               # drizzle schema + database 连接
├── application/               # 认证会话辅助
├── lib/
│   ├── lexicon.ts             # 雅思词库分析（客户端实时高亮）
│   ├── prompts.ts             # LLM Prompt 构建器（报告/框架/教练/范文）
│   ├── llm.ts                 # 服务端 LLM 客户端（Key 不暴露）
│   ├── bank.ts                # 题库加载器
│   └── dict.ts / i18n.ts      # 中英双语字典
├── hooks/                     # useSpeechRecognition / useTimer / useStreamText
├── components/                # UI 组件（auth/bank/practice/recite/library/settings）
└── store/                     # zustand 状态（sessionStore / settingsStore）
```

## 认证说明

认证栈直接复用 [FieldClose](https://github.com/)（better-auth 1.6.25 + drizzle + postgres）：
- 邮箱+密码 或 邮箱 6 位验证码 登录
- 注册需邮箱验证（开发环境 OTP 打印到控制台）
- better-auth 的 `user/session/account/verification` 四表名不可改名（adapter 运行时解析）

## 部署（生产）

1. `.env.local` 配齐：`IELTS_PUBLIC_BASE_URL`(HTTPS)、`BETTER_AUTH_SECRET`(≥32位)、`DATABASE_URL`（非 loopback 需 `sslmode=verify-full`）、SMTP 或 Resend
2. `npm run build && npm start`
3. 可用 PM2 / Docker / 系统服务守护；也可部署到 Vercel（需外部 Postgres）

## License

MIT
