import { prisma, ensureAccounts } from "./index";

const merchant = await prisma.merchant.upsert({
  where: { apiKey: "tp_test_demo_key" },
  create: { name: "Demo Merchant", apiKey: "tp_test_demo_key" },
  update: {},
});
await prisma.$transaction((tx) => ensureAccounts(tx, merchant.id));
console.log(`Seeded merchant ${merchant.id} with API key tp_test_demo_key`);

const ops = await prisma.opsUser.upsert({
  where: { apiKey: "tp_ops_demo_key" },
  create: { name: "Demo Reviewer", apiKey: "tp_ops_demo_key" },
  update: {},
});
console.log(`Seeded ops user ${ops.id} with API key tp_ops_demo_key`);
await prisma.$disconnect();
