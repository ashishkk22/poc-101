/**
 * Demo seed.
 *
 * Creates an organizer and three participants, plus calls positioned before,
 * during and after their window so every authorization branch in the demo
 * script can be exercised immediately after `docker compose up`.
 *
 * Raw invitation tokens are printed ONCE here, to the operator's terminal.
 * They are not written to the database, the logger or any file.
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { auth } from '../src/modules/auth/auth.js';
import { generateRawToken, hashToken } from '../src/shared/security/tokens.js';
import { addMinutes } from '../src/shared/time/window.js';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL as string }),
});

const DEMO_PASSWORD = 'SyncDemo123!';

const PEOPLE = [
  { email: 'organizer@example.com', name: 'Olivia Organizer' },
  { email: 'alice@example.com', name: 'Alice Participant' },
  { email: 'bob@example.com', name: 'Bob Participant' },
  { email: 'carol@example.com', name: 'Carol Participant' },
] as const;

async function ensureUser(email: string, name: string): Promise<string> {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    // Re-apply the demo password so a changed DEMO_PASSWORD reaches existing users.
    const ctx = await auth.$context;
    await prisma.account.updateMany({
      where: { userId: existing.id, providerId: 'credential' },
      data: { password: await ctx.password.hash(DEMO_PASSWORD) },
    });
    return existing.id;
  }

  // Sign-up goes through Better Auth so password hashing matches sign-in.
  await auth.api.signUpEmail({ body: { email, name, password: DEMO_PASSWORD } });

  const created = await prisma.user.findUnique({ where: { email } });
  if (!created) throw new Error(`failed to create demo user ${email}`);
  return created.id;
}

async function main(): Promise<void> {
  const now = new Date();

  const [organizerId, aliceId, bobId, carolId] = await Promise.all(
    PEOPLE.map((person) => ensureUser(person.email, person.name)),
  );

  // Clean slate for the demo calls, leaving users and their credentials intact.
  await prisma.call.deleteMany({ where: { organizerId } });

  const calls = await Promise.all([
    prisma.call.create({
      data: {
        organizerId: organizerId ?? '',
        title: 'Live Now — Security Architecture Review',
        scheduledStart: addMinutes(now, -10),
        scheduledEnd: addMinutes(now, 50),
        timezone: 'Asia/Kolkata',
        status: 'LIVE',
      },
    }),
    prisma.call.create({
      data: {
        organizerId: organizerId ?? '',
        title: 'Upcoming — Roadmap Planning',
        scheduledStart: addMinutes(now, 120),
        scheduledEnd: addMinutes(now, 180),
        timezone: 'Asia/Kolkata',
        status: 'SCHEDULED',
      },
    }),
    prisma.call.create({
      data: {
        organizerId: organizerId ?? '',
        title: 'Finished — Quarterly Retrospective',
        scheduledStart: addMinutes(now, -180),
        scheduledEnd: addMinutes(now, -120),
        timezone: 'Asia/Kolkata',
        status: 'ENDED',
        endedAt: addMinutes(now, -120),
      },
    }),
  ]);

  const [liveCall, upcomingCall, endedCall] = calls;
  const issued: Array<{ call: string; participant: string; rawToken: string }> = [];

  async function invite(
    callId: string,
    participantId: string,
    participantLabel: string,
    callLabel: string,
    expiresAt: Date,
  ) {
    const rawToken = generateRawToken();
    await prisma.invitation.create({
      data: { callId, participantId, tokenHash: hashToken(rawToken), expiresAt, status: 'ACTIVE' },
    });
    issued.push({ call: callLabel, participant: participantLabel, rawToken });
  }

  await invite(
    liveCall.id,
    aliceId ?? '',
    'alice@example.com',
    'Live Now',
    addMinutes(liveCall.scheduledEnd, 60),
  );
  await invite(
    liveCall.id,
    bobId ?? '',
    'bob@example.com',
    'Live Now',
    addMinutes(liveCall.scheduledEnd, 60),
  );
  await invite(
    upcomingCall.id,
    aliceId ?? '',
    'alice@example.com',
    'Upcoming',
    addMinutes(upcomingCall.scheduledEnd, 60),
  );
  await invite(
    endedCall.id,
    carolId ?? '',
    'carol@example.com',
    'Finished',
    addMinutes(endedCall.scheduledEnd, 60),
  );

  // A ready transcript on the finished call, for the transcript ACL demo.
  await prisma.transcript.upsert({
    where: { callId: endedCall.id },
    create: {
      callId: endedCall.id,
      status: 'READY',
      content: [
        `Transcript for call ${endedCall.id}`,
        '',
        '[00:00] Speaker 1: Welcome to the quarterly retrospective.',
        '[00:09] Speaker 2: Lets start with what went well.',
      ].join('\n'),
      generatedAt: addMinutes(now, -115),
      expiresAt: addMinutes(now, 60 * 24 * 30),
    },
    update: {},
  });

  console.log('\nSync seed complete.\n');
  console.log(`  Password for every demo account: ${DEMO_PASSWORD}\n`);
  console.log('  Accounts:');
  for (const person of PEOPLE) console.log(`    ${person.email.padEnd(24)} ${person.name}`);
  console.log('\n  Calls:');
  for (const call of calls) {
    console.log(`    ${call.status.padEnd(10)} ${call.id}  ${call.title}`);
  }
  console.log('\n  Join tokens (shown once — only their hashes are stored):');
  for (const entry of issued) {
    console.log(`    [${entry.call}] ${entry.participant}`);
    console.log(`      /join/${entry.rawToken}`);
  }
  console.log('');
}

main()
  .catch((error) => {
    console.error('seed failed:', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
