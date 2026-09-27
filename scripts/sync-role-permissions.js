/**
 * Copies current default role permissions onto existing system roles and users.
 * Use when the database was seeded before later modules added permission codes.
 */
const { config } = require('dotenv');
const mongoose = require('mongoose');
const {
  ALL_PERMISSIONS,
  DEFAULT_ROLE_PERMISSIONS,
} = require('../dist/common/constants/permissions');
const { SystemRole } = require('../dist/common/constants/system-roles');

config();

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI is not set');
  }

  await mongoose.connect(uri);
  const roles = mongoose.connection.collection('roles');
  const users = mongoose.connection.collection('users');
  const permissions = mongoose.connection.collection('permissions');

  let permissionInserts = 0;
  for (const code of ALL_PERMISSIONS) {
    const result = await permissions.updateOne(
      { code },
      {
        $setOnInsert: {
          code,
          name: code,
          module: code.split('.')[0],
          description: `Permission ${code}`,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      },
      { upsert: true },
    );
    if (result.upsertedCount) permissionInserts += 1;
  }

  const summaries = [];
  for (const [code, granted] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
    const roleResult = await roles.updateMany(
      { code },
      { $set: { permissions: granted } },
    );
    const userResult = await users.updateMany(
      { role: code },
      { $set: { permissions: granted } },
    );
    summaries.push(
      `${code}: roles ${roleResult.modifiedCount}, users ${userResult.modifiedCount}, permissions ${granted.length}`,
    );
  }

  const superRoles = await roles.updateMany(
    { code: SystemRole.SUPER_ADMIN },
    { $set: { permissions: ALL_PERMISSIONS } },
  );
  const superUsers = await users.updateMany(
    { role: SystemRole.SUPER_ADMIN },
    { $set: { permissions: ALL_PERMISSIONS } },
  );

  console.log(`Permission catalog inserts: ${permissionInserts}`);
  console.log(summaries.join('\n'));
  console.log(
    `SUPER_ADMIN: roles ${superRoles.modifiedCount}, users ${superUsers.modifiedCount}, permissions ${ALL_PERMISSIONS.length}`,
  );

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error.message);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
