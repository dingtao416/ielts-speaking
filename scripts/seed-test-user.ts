// 创建测试账号（root / 123456），可直接登录，无需邮箱验证。
// 用法: npx tsx scripts/seed-test-user.mjs  （或用 tsx 跑 TS）
// 说明: better-auth 默认 requireEmailVerification，创建后强制置为已验证。
import "dotenv/config";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { username } from "better-auth/plugins";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import * as schema from "../src/persistence/schema";

const DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://ielts:ielts@127.0.0.1:5432/ielts";
const client = postgres(DATABASE_URL, { prepare: false });
const db = drizzle(client, { schema });

const TEST_EMAIL = "root@ielts.local";
const TEST_USERNAME = "root";
const TEST_PASSWORD = "12345678";

const auth = betterAuth({
  appName: "IELTS Speaking Trainer",
  baseURL: "http://localhost:3000",
  secret: process.env.BETTER_AUTH_SECRET || "seed-only-secret-1234567890123456",
  database: drizzleAdapter(db, { provider: "pg", schema }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
  },
  plugins: [username({})],
});

async function main() {
  // 检查是否已存在
  const existing = await db
    .select()
    .from(schema.user)
    .where(eq(schema.user.email, TEST_EMAIL))
    .limit(1);

  if (existing.length > 0) {
    console.log("✓ 测试账号已存在，跳过创建");
    return;
  }

  const result = await auth.api.signUpEmail({
    body: {
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      name: "Test Admin",
      username: TEST_USERNAME,
      displayUsername: TEST_USERNAME,
    },
  });

  if (result.token || result.user) {
    // 强制标记为已验证（跳过邮箱验证）
    await db
      .update(schema.user)
      .set({ emailVerified: true })
      .where(eq(schema.user.email, TEST_EMAIL));
    console.log(`✓ 测试账号已创建: ${TEST_USERNAME} / ${TEST_PASSWORD}`);
    console.log(`  邮箱: ${TEST_EMAIL}（已自动验证，可直接登录）`);
  } else {
    console.error("✗ 创建失败:", result);
    process.exit(1);
  }
}

main()
  .catch((e) => {
    console.error("✗ 出错:", e.message);
    process.exit(1);
  })
  .finally(() => client.end());
