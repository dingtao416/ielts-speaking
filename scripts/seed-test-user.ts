// 创建或重置测试账号（root / 11111111），可直接登录，无需邮箱验证。
// 用法: npx tsx scripts/seed-test-user.mjs  （或用 tsx 跑 TS）
// 说明: better-auth 默认 requireEmailVerification，创建后强制置为已验证。
import "dotenv/config";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { username } from "better-auth/plugins";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { and, eq } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
import * as schema from "../src/persistence/schema";

const DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://ielts:ielts@127.0.0.1:5432/ielts";
const client = postgres(DATABASE_URL, { prepare: false });
const db = drizzle(client, { schema });

const TEST_EMAIL = "root@ielts.local";
const TEST_USERNAME = "root";
const TEST_PASSWORD = "11111111";

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

  const existingUser = existing[0];

  if (!existingUser) {
    const result = await auth.api.signUpEmail({
      body: {
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
        name: "Test Admin",
        username: TEST_USERNAME,
        displayUsername: TEST_USERNAME,
      },
    });

    if (!result.token && !result.user) {
      console.error("✗ 创建失败:", result);
      process.exit(1);
    }

    console.log("✓ 测试账号已创建");
  } else {
    const passwordHash = await hashPassword(TEST_PASSWORD);
    const credentialAccount = await db
      .select({ id: schema.account.id })
      .from(schema.account)
      .where(
        and(
          eq(schema.account.userId, existingUser.id),
          eq(schema.account.providerId, "credential"),
        ),
      )
      .limit(1);

    if (credentialAccount[0]) {
      await db
        .update(schema.account)
        .set({ password: passwordHash })
        .where(eq(schema.account.id, credentialAccount[0].id));
    } else {
      await db.insert(schema.account).values({
        id: crypto.randomUUID(),
        accountId: existingUser.id,
        providerId: "credential",
        userId: existingUser.id,
        password: passwordHash,
      });
    }

    console.log("✓ 测试账号密码已重置");
  }

  // 测试账号可直接登录，无需完成邮箱验证。
  await db
    .update(schema.user)
    .set({ emailVerified: true })
    .where(eq(schema.user.email, TEST_EMAIL));

  console.log(`  用户名: ${TEST_USERNAME}`);
  console.log(`  密码: ${TEST_PASSWORD}`);
  console.log(`  邮箱: ${TEST_EMAIL}（已自动验证）`);
}

main()
  .catch((e) => {
    console.error("✗ 出错:", e.message);
    process.exit(1);
  })
  .finally(() => client.end());
