/**
 * An end-to-end smoke test against a LIVE server.
 *
 * Unlike the unit tests this uses no mocks at all: real HTTP, real PostgreSQL,
 * real SQL. This is the only place that can say the visibility filter works at
 * the database level and not merely in the shape of an object.
 *
 * Prerequisites:
 *   the database up and REACHABLE FROM THE HOST — on this machine PostgreSQL
 *   lives in WSL, which is not the same 127.0.0.1 the API sees unless the
 *   listener says so; see docs/07-IMPROVEMENTS.md item 30
 *   npm --prefix apps/api run prisma:migrate
 *   npm --prefix apps/api run dev      (in another window)
 *
 * Run:  npm --prefix apps/api run smoke
 *
 * One run creates two accounts and signs in twice. Registration is limited to
 * five per address per hour (common/rate-limit.guard.ts), so the third run
 * within an hour from one machine fails on `too_many_attempts` — which is the
 * limit working, not the API breaking. Wait, or restart the API: the counters
 * live in memory.
 */

import { PrismaClient } from '@prisma/client';
import sharp from 'sharp';

const BASE = process.env.SMOKE_BASE_URL ?? 'http://localhost:3000/v1';

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, detail = ''): void {
  if (condition) {
    passed++;
    console.log(`  ok    ${name}`);
  } else {
    failed++;
    console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

interface Session {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string };
}

async function call<T>(
  method: string,
  path: string,
  options: { token?: string; body?: unknown; expectStatus?: number } = {},
): Promise<{ status: number; body: T }> {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Accept: 'application/json',
      ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  const text = await response.text();
  return { status: response.status, body: (text ? JSON.parse(text) : undefined) as T };
}

/** Every run uses its own email addresses, so the test can be repeated. */
const stamp = Date.now();
const email = (name: string) => `smoke_${name}_${stamp}@example.test`;
const PASSWORD = 'SmokeTest2026!';

async function main(): Promise<void> {
  console.log(`\nFamStory smoke test → ${BASE}\n`);

  const health = await call<{ status: string; database: string }>('GET', '/health');
  check(
    'the health check answers, database included, without a token',
    health.status === 200 && health.body?.database === 'ok',
    `got ${health.status} ${JSON.stringify(health.body)}`,
  );

  // -------------------------------------------------------------------------
  console.log('1. Authentication');

  const registration = await call<Session>('POST', '/auth/email/register', {
    body: { email: email('anna'), password: PASSWORD, displayName: 'Anna' },
  });
  check('registration returns tokens', Boolean(registration.body?.accessToken));
  const anna = registration.body;

  const noAuth = await call('GET', '/users/me');
  check('without a token → 401', noAuth.status === 401, `got ${noAuth.status}`);

  const me = await call<{ email: string }>('GET', '/users/me', { token: anna.accessToken });
  check('with a token → the profile', me.status === 200);

  const wrongPassword = await call('POST', '/auth/email/login', {
    body: { email: anna.user.email, password: 'wrong' },
  });
  check('wrong password → 401', wrongPassword.status === 401);

  // The contract the client reads (docs/05-API.md). For as long as the server
  // sent Nest's flat default, every refusal reached the app without its reason.
  const refusal = wrongPassword.body as { error?: { code?: string; requestId?: string } };
  check(
    'a refusal arrives in the documented shape, with its code',
    refusal?.error?.code === 'invalid_credentials' && Boolean(refusal.error.requestId),
    JSON.stringify(wrongPassword.body),
  );

  const refreshed = await call<Session>('POST', '/auth/refresh', {
    body: { refreshToken: anna.refreshToken },
  });
  check('refresh returns a new pair', Boolean(refreshed.body?.accessToken));

  const reused = await call('POST', '/auth/refresh', { body: { refreshToken: anna.refreshToken } });
  check(
    'a reused refresh token → the session is revoked',
    reused.status === 401,
    `got ${reused.status}`,
  );

  // After theft detection the whole chain is revoked — sign in again.
  const reLogin = await call<Session>('POST', '/auth/email/login', {
    body: { email: anna.user.email, password: PASSWORD },
  });
  const annaToken = reLogin.body.accessToken;

  // -------------------------------------------------------------------------
  console.log('\n2. Family and members');

  // Stored as local noon by the app; any instant will do here.
  const annaBirthday = '1985-06-01T09:00:00.000Z';
  const veraBirthday = '1950-11-20T10:00:00.000Z';

  const family = await call<{ id: string; groups: { id: string; icon: string | null }[] }>(
    'POST',
    '/families',
    { token: annaToken, body: { name: `Smoke family ${stamp}`, birthDate: annaBirthday } },
  );
  check('the family is created', family.status === 201, `got ${family.status}`);

  const typo = await call<{ error: { code: string } }>('POST', '/families', {
    token: annaToken,
    body: { name: `Smoke typo ${stamp}`, birthDate: '2096-06-01T09:00:00.000Z' },
  });
  check(
    'a birthday in the future is refused, with its code',
    typo.status === 400 && typo.body?.error?.code === 'invalid_birth_date',
    `got ${typo.status} ${JSON.stringify(typo.body)}`,
  );

  const familyId = family.body.id;
  const parentsGroup = family.body.groups.find((g) => g.icon === 'parents');
  check('three system groups appeared automatically', family.body.groups.length === 3);
  check('the Parents group exists', Boolean(parentsGroup));

  // The name can be changed later, as the app says when it is given.
  const blankName = await call<{ error: { code: string } }>('PATCH', `/families/${familyId}`, {
    token: annaToken,
    body: { name: '   ' },
  });
  check(
    'a blank family name is refused, with its code',
    blankName.status === 400 && blankName.body?.error?.code === 'invalid_name',
    `got ${blankName.status} ${JSON.stringify(blankName.body)}`,
  );
  const renamed = await call<{ name: string }>('PATCH', `/families/${familyId}`, {
    token: annaToken,
    body: { name: `  Smoke renamed ${stamp}  ` },
  });
  check(
    'the administrator renames the family, trimmed',
    renamed.status === 200 && renamed.body?.name === `Smoke renamed ${stamp}`,
    `got ${renamed.status} ${JSON.stringify(renamed.body)}`,
  );

  const child = await call<{ id: string; role: string; managedByMemberId: string }>(
    'POST',
    `/families/${familyId}/children`,
    { token: annaToken, body: { displayName: 'Emily' } },
  );
  check('the child profile is created', child.status === 201);
  check('the child has a named manager', Boolean(child.body?.managedByMemberId));

  const invitation = await call<{ code: string }>('POST', `/families/${familyId}/invitations`, {
    token: annaToken,
    body: { role: 'viewer' },
  });
  check('the invitation is created', Boolean(invitation.body?.code));

  const preview = await call<Record<string, unknown>>('GET', `/invitations/${invitation.body.code}`);
  check('the invitation preview is public', preview.status === 200);
  check(
    'the preview DOES NOT reveal the members',
    !('members' in preview.body) && !('events' in preview.body),
    JSON.stringify(preview.body),
  );

  // --- A grandparent joins as a viewer ---
  const veraReg = await call<Session>('POST', '/auth/email/register', {
    body: { email: email('vera'), password: PASSWORD, displayName: 'Vera' },
  });
  const veraToken = veraReg.body.accessToken;

  const outsider = await call('GET', `/families/${familyId}`, { token: veraToken });
  check('an outsider does not see the family → 403', outsider.status === 403, `got ${outsider.status}`);

  const accepted = await call('POST', `/invitations/${invitation.body.code}/accept`, {
    token: veraToken,
    body: { birthDate: veraBirthday },
  });
  check('the invitation is accepted', accepted.status === 200);

  // "About you" runs before either of them has a family. Both birthdays have to
  // survive the trip to a member row, which for a long time neither did.
  const roster = await call<{ members: { userId: string | null; birthDate: string | null }[] }>(
    'GET',
    `/families/${familyId}`,
    { token: annaToken },
  );
  const birthdayOf = (userId: string) =>
    roster.body.members.find((m) => m.userId === userId)?.birthDate;
  check(
    'the birthdays from "About you" reach both member rows',
    birthdayOf(anna.user.id) === annaBirthday && birthdayOf(veraReg.body.user.id) === veraBirthday,
    JSON.stringify(roster.body.members.map((m) => m.birthDate)),
  );

  // Health information (GDPR Art. 9): refused until the author consents, which
  // the app asks before the first one. Anna consents here, for the health
  // entries below.
  const healthFirst = await call<{ error: { code: string } }>('POST', `/families/${familyId}/events`, {
    token: annaToken,
    body: { title: 'Dentist', startsAt: new Date().toISOString(), categoryId: 'health' },
  });
  check(
    'a health entry is refused before its author consents',
    healthFirst.status === 403 && healthFirst.body?.error?.code === 'health_consent_required',
    `got ${healthFirst.status} ${JSON.stringify(healthFirst.body)}`,
  );
  const consent = await call<{ healthConsentAt: string | null }>('PATCH', '/users/me', {
    token: annaToken,
    body: { healthConsent: true },
  });
  check('consent is recorded, with when', consent.status === 200 && Boolean(consent.body?.healthConsentAt));

  // -------------------------------------------------------------------------
  console.log('\n3. Visibility — the part that matters most');

  const publicEvent = await call<{ id: string }>('POST', `/families/${familyId}/events`, {
    token: annaToken,
    body: {
      title: 'For the whole family',
      startsAt: new Date().toISOString(),
      categoryId: 'celebration',
      visibility: { kind: 'family' },
    },
  });
  check('an event for the whole family is created', publicEvent.status === 201);

  const parentsOnly = await call<{ id: string }>('POST', `/families/${familyId}/events`, {
    token: annaToken,
    body: {
      title: 'Parents only',
      startsAt: new Date().toISOString(),
      categoryId: 'health',
      visibility: { kind: 'groups', groupIds: [parentsGroup!.id] },
    },
  });

  const privateEvent = await call<{ id: string }>('POST', `/families/${familyId}/events`, {
    token: annaToken,
    body: {
      title: 'Anna only',
      startsAt: new Date().toISOString(),
      categoryId: 'other',
      visibility: { kind: 'private' },
    },
  });

  // A child among the participants with no visibility given — the server has to
  // apply the safe default itself.
  const childEvent = await call<{ id: string; visibilityKind: string }>(
    'POST',
    `/families/${familyId}/events`,
    {
      token: annaToken,
      body: {
        title: "Emily's doctor",
        startsAt: new Date().toISOString(),
        categoryId: 'health',
        participantMemberIds: [child.body.id],
      },
    },
  );
  check(
    'a child among the participants → visibility narrows to the group automatically',
    childEvent.body?.visibilityKind === 'groups',
    `got ${childEvent.body?.visibilityKind}`,
  );

  const annaSees = await call<{ items: { id: string; title: string }[] }>(
    'GET',
    `/families/${familyId}/events`,
    { token: annaToken },
  );
  check('Anna sees all 4 events', annaSees.body.items.length === 4, `sees ${annaSees.body.items.length}`);

  const veraSees = await call<{ items: { id: string; title: string }[] }>(
    'GET',
    `/families/${familyId}/events`,
    { token: veraToken },
  );
  const veraTitles = veraSees.body.items.map((e) => e.title);

  check('Vera sees the whole-family event', veraTitles.includes('For the whole family'));
  check('Vera DOES NOT see the parents-only event', !veraTitles.includes('Parents only'), veraTitles.join(', '));
  check('Vera DOES NOT see the private event', !veraTitles.includes('Anna only'), veraTitles.join(', '));
  check("Vera DOES NOT see the child's health event", !veraTitles.includes("Emily's doctor"));
  check('Vera sees exactly 1 event', veraSees.body.items.length === 1, `sees ${veraSees.body.items.length}`);

  // A direct request by id — the filter must not live at list level only.
  const directHit = await call('GET', `/families/${familyId}/events/${privateEvent.body.id}`, {
    token: veraToken,
  });
  check(
    'a direct request for a hidden event id → 403',
    directHit.status === 403,
    `got ${directHit.status}`,
  );

  // -------------------------------------------------------------------------
  console.log('\n4. Role capabilities');

  const viewerWrite = await call('POST', `/families/${familyId}/events`, {
    token: veraToken,
    body: { title: "A viewer's attempt", startsAt: new Date().toISOString(), categoryId: 'other' },
  });
  check('a viewer cannot add an event → 403', viewerWrite.status === 403, `got ${viewerWrite.status}`);

  const viewerInvite = await call('POST', `/families/${familyId}/invitations`, {
    token: veraToken,
    body: { role: 'member' },
  });
  check('a viewer cannot invite → 403', viewerInvite.status === 403);

  const viewerComment = await call('POST', `/families/${familyId}/events/${publicEvent.body.id}/comments`, {
    token: veraToken,
    body: { body: 'How lovely!' },
  });
  check('a viewer CAN comment on a visible event', viewerComment.status === 201, `got ${viewerComment.status}`);

  const viewerCommentHidden = await call(
    'POST',
    `/families/${familyId}/events/${parentsOnly.body.id}/comments`,
    { token: veraToken, body: { body: 'Cannot see it, still commenting' } },
  );
  check(
    'a viewer CANNOT comment on an invisible event → 403',
    viewerCommentHidden.status === 403,
    `got ${viewerCommentHidden.status}`,
  );

  // -------------------------------------------------------------------------
  console.log('\n5. Editing, deleting and reacting');

  const edited = await call<{ title: string; description: string | null }>(
    'PATCH',
    `/families/${familyId}/events/${publicEvent.body.id}`,
    { token: annaToken, body: { title: 'For the whole family, corrected' } },
  );
  check('the author edits their own event', edited.body?.title === 'For the whole family, corrected');
  check(
    'a field the PATCH did not mention is left alone',
    edited.body?.description === null || edited.body?.description === undefined,
    JSON.stringify(edited.body?.description),
  );

  const viewerEdit = await call('PATCH', `/families/${familyId}/events/${publicEvent.body.id}`, {
    token: veraToken,
    body: { title: 'A viewer renaming somebody else' },
  });
  check('a viewer cannot edit → 403', viewerEdit.status === 403, `got ${viewerEdit.status}`);

  const reaction = await call<{ kind: string } | null>(
    'PUT',
    `/families/${familyId}/events/${publicEvent.body.id}/reactions`,
    { token: veraToken, body: { kind: 'heart' } },
  );
  check('a viewer can react to a visible event', reaction.body?.kind === 'heart');

  const reactionOff = await call<{ kind: string } | null>(
    'PUT',
    `/families/${familyId}/events/${publicEvent.body.id}/reactions`,
    { token: veraToken, body: { kind: 'heart' } },
  );
  check('the same reaction again removes it', reactionOff.body === null || reactionOff.status === 200);

  const hiddenReaction = await call(
    'PUT',
    `/families/${familyId}/events/${parentsOnly.body.id}/reactions`,
    { token: veraToken, body: { kind: 'heart' } },
  );
  check(
    'a reaction cannot reach an invisible event → 403',
    hiddenReaction.status === 403,
    `got ${hiddenReaction.status}`,
  );

  const deleted = await call('DELETE', `/families/${familyId}/events/${publicEvent.body.id}`, {
    token: annaToken,
  });
  check('deleting returns 204', deleted.status === 204, `got ${deleted.status}`);

  const afterDelete = await call<{ items: { id: string }[] }>(
    'GET',
    `/families/${familyId}/events`,
    { token: annaToken },
  );
  check(
    'a deleted event leaves the timeline',
    !afterDelete.body.items.some((e) => e.id === publicEvent.body.id),
  );

  const gone = await call('GET', `/families/${familyId}/events/${publicEvent.body.id}`, {
    token: annaToken,
  });
  check('and cannot be fetched by id either → 403', gone.status === 403, `got ${gone.status}`);

  const restored = await call<{ id: string }>(
    'POST',
    `/families/${familyId}/events/${publicEvent.body.id}/restore`,
    { token: annaToken },
  );
  // The same id, because a new one would orphan every comment hanging off it.
  check('undo brings it back under the same id', restored.body?.id === publicEvent.body.id);

  const comebackComments = await call<{ id: string }[]>(
    'GET',
    `/families/${familyId}/events/${publicEvent.body.id}/comments`,
    { token: annaToken },
  );
  check(
    "and the conversation came back with it",
    comebackComments.body.length > 0,
    `${comebackComments.body.length} comments`,
  );

  const restoreAgain = await call(
    'POST',
    `/families/${familyId}/events/${publicEvent.body.id}/restore`,
    { token: annaToken },
  );
  check(
    'restoring something that is not deleted → 404',
    restoreAgain.status === 404,
    `got ${restoreAgain.status}`,
  );

  // -------------------------------------------------------------------------
  console.log('\n6. The AI layer');

  const suggestion = await call<{ payload?: { categoryId?: string } } | null>(
    'POST',
    `/families/${familyId}/ai/suggest-category`,
    { token: annaToken, body: { title: "Robert's birthday" } },
  );
  check(
    'the category suggestion recognises a celebration',
    suggestion.body?.payload?.categoryId === 'celebration',
    JSON.stringify(suggestion.body),
  );

  // A conflict is built from events, so it may only be built from the ones
  // the asker can see. "Emily's doctor" (section 3) is for the parents, and
  // with no end it holds an hour from when it was made.
  const clash = {
    startsAt: new Date(Date.now() + 10 * 60_000).toISOString(),
    participantMemberIds: [child.body.id],
  };
  const annaClash = await call<{ payload?: { eventIds?: string[]; memberIds?: string[] } } | null>(
    'POST',
    `/families/${familyId}/ai/detect-conflicts`,
    { token: annaToken, body: clash },
  );
  check(
    'a parent is told Emily already has something then, and that it is Emily',
    Boolean(annaClash.body?.payload?.eventIds?.includes(childEvent.body.id)) &&
      annaClash.body?.payload?.memberIds?.[0] === child.body.id,
    JSON.stringify(annaClash.body),
  );
  const veraClash = await call<{ payload?: { eventIds?: string[] } } | null>(
    'POST',
    `/families/${familyId}/ai/detect-conflicts`,
    { token: veraToken, body: clash },
  );
  check(
    'a grandparent is not - not even that there is something',
    !(veraClash.body?.payload?.eventIds ?? []).includes(childEvent.body.id),
    JSON.stringify(veraClash.body),
  );

  // -------------------------------------------------------------------------
  console.log('\n7. Photographs');

  // A real JPEG, because the server reads it: dimensions, orientation and a
  // thumbnail all come from actually decoding the bytes.
  const photo = await sharp({
    create: { width: 1600, height: 1200, channels: 3, background: { r: 35, g: 78, b: 66 } },
  })
    .jpeg()
    .toBuffer();

  const photoEvent = await call<{ id: string }>('POST', `/families/${familyId}/events`, {
    token: annaToken,
    body: {
      title: 'Beach afternoon',
      startsAt: new Date().toISOString(),
      allDay: true,
      categoryId: 'celebration',
      visibility: { kind: 'family' },
    },
  });

  const target = await call<{ attachmentId: string; uploadUrl: string; method: string }>(
    'POST',
    `/families/${familyId}/events/${photoEvent.body.id}/uploads`,
    { token: annaToken, body: { mimeType: 'image/jpeg', sizeBytes: photo.length } },
  );
  check('asking where to put a photograph is allowed', target.status === 201, `got ${target.status}`);
  check(
    'the upload link names the attachment it created',
    target.body.uploadUrl?.includes(target.body.attachmentId),
    target.body.uploadUrl,
  );

  const refusedVideo = await call(
    'POST',
    `/families/${familyId}/events/${photoEvent.body.id}/uploads`,
    { token: annaToken, body: { mimeType: 'video/mp4', sizeBytes: 1000 } },
  );
  check('a video is refused for now, clearly', refusedVideo.status === 400, `got ${refusedVideo.status}`);

  const put = await fetch(target.body.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'image/jpeg' },
    body: photo,
  });
  check('the bytes are accepted', put.status === 204, `got ${put.status}`);

  const tampered = await fetch(target.body.uploadUrl.replace(/signature=./, 'signature=x'), {
    method: 'PUT',
    headers: { 'Content-Type': 'image/jpeg' },
    body: photo,
  });
  check('an edited upload link is refused', tampered.status === 403, `got ${tampered.status}`);

  const completed = await call<{ width: number; height: number; thumbnailKey: string | null }>(
    'POST',
    `/families/${familyId}/uploads/${target.body.attachmentId}/complete`,
    { token: annaToken },
  );
  check(
    'the server read the real dimensions',
    completed.body.width === 1600 && completed.body.height === 1200,
    JSON.stringify(completed.body),
  );
  check('and made a thumbnail', Boolean(completed.body.thumbnailKey), JSON.stringify(completed.body));

  const withPhoto = await call<{
    items: { id: string; attachments: { url: string; thumbnailUrl: string }[] }[];
  }>('GET', `/families/${familyId}/events?limit=50`, { token: annaToken });

  const listed = withPhoto.body.items.find((e) => e.id === photoEvent.body.id);
  check(
    'the event arrives with a link to its photograph',
    Boolean(listed?.attachments?.[0]?.url),
    JSON.stringify(listed?.attachments),
  );

  const thumbnailUrl = listed?.attachments?.[0]?.thumbnailUrl ?? '';
  const thumbnail = await fetch(thumbnailUrl);
  const thumbnailBytes = Buffer.from(await thumbnail.arrayBuffer());
  check('the link serves the photograph', thumbnail.status === 200, `got ${thumbnail.status}`);
  check(
    'the thumbnail is smaller than the original',
    thumbnailBytes.length > 0 && thumbnailBytes.length < photo.length,
    `${thumbnailBytes.length} vs ${photo.length}`,
  );

  const forged = await fetch(thumbnailUrl.replace(/signature=./, 'signature=x'));
  check('an edited read link is not found', forged.status === 404, `got ${forged.status}`);

  // The whole reason the URL is signed rather than public: the visibility
  // check has to reach the photograph, not just the event around it.
  const veraOnPrivatePhoto = await call(
    'GET',
    `/families/${familyId}/attachments/${target.body.attachmentId}/url`,
    { token: veraToken },
  );
  check(
    'a viewer can reach a photograph on an event they can see',
    veraOnPrivatePhoto.status === 200,
    `got ${veraOnPrivatePhoto.status}`,
  );

  // -------------------------------------------------------------------------
  console.log('\n8. The bell');

  interface Bell {
    id: string;
    kind: string;
    eventId: string | null;
    actorName: string | null;
    readAt: string | null;
  }

  // Written after the response, so give it a moment rather than racing it.
  const bellOf = async (token: string, until?: (rows: Bell[]) => boolean) => {
    for (let attempt = 0; attempt < 20; attempt++) {
      const bell = await call<Bell[]>('GET', `/families/${familyId}/notifications`, { token });
      if (!until || until(bell.body)) return bell.body;
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    return (await call<Bell[]>('GET', `/families/${familyId}/notifications`, { token })).body;
  };

  const veraBell = await bellOf(veraToken, (rows) =>
    rows.some((r) => r.eventId === publicEvent.body.id),
  );
  check(
    'a family event reaches the grandmother’s bell',
    veraBell.some((r) => r.kind === 'event_created' && r.eventId === publicEvent.body.id),
    JSON.stringify(veraBell.map((r) => [r.kind, r.eventId])),
  );
  check(
    'with the name of whoever added it',
    veraBell.find((r) => r.eventId === publicEvent.body.id)?.actorName === 'Anna',
    JSON.stringify(veraBell.find((r) => r.eventId === publicEvent.body.id)),
  );

  // The one that matters: a notification must never be where an event leaks.
  check(
    'a parents-only event does NOT reach her',
    !veraBell.some((r) => r.eventId === parentsOnly.body.id),
    JSON.stringify(veraBell.map((r) => r.eventId)),
  );
  check(
    'nor a private one',
    !veraBell.some((r) => r.eventId === privateEvent.body.id),
    JSON.stringify(veraBell.map((r) => r.eventId)),
  );

  const annaBellBefore = await bellOf(annaToken);
  check(
    'nobody is told about their own event',
    !annaBellBefore.some((r) => r.kind === 'event_created' && r.eventId === publicEvent.body.id),
  );

  await call('POST', `/families/${familyId}/events/${publicEvent.body.id}/comments`, {
    token: veraToken,
    body: { body: 'What a day that was.' },
  });

  const annaBell = await bellOf(annaToken, (rows) => rows.some((r) => r.kind === 'comment_added'));
  check(
    'a reply reaches the author of the event',
    annaBell.some((r) => r.kind === 'comment_added' && r.eventId === publicEvent.body.id),
    JSON.stringify(annaBell.map((r) => r.kind)),
  );
  check(
    'and the admin heard that the grandmother joined',
    annaBell.some((r) => r.kind === 'member_joined'),
    JSON.stringify(annaBell.map((r) => r.kind)),
  );

  const readAll = await call('POST', `/families/${familyId}/notifications/read-all`, { token: veraToken });
  check('marking everything read works', readAll.status === 204, `got ${readAll.status}`);

  const veraAfter = await bellOf(veraToken);
  check(
    'and leaves nothing unread',
    veraAfter.every((r) => r.readAt !== null),
    JSON.stringify(veraAfter.map((r) => r.readAt)),
  );

  // The settings screen's switches, kept on the account and obeyed here.
  const quiet = await call<{ notifyEvents: boolean; defaultReminderMinutes: number | null }>(
    'PATCH',
    '/users/me',
    { token: veraToken, body: { notifyEvents: false, defaultReminderMinutes: 1440 } },
  );
  check(
    'new events can be switched off for oneself, and a default reminder kept',
    quiet.status === 200 && quiet.body?.notifyEvents === false && quiet.body?.defaultReminderMinutes === 1440,
    `got ${quiet.status} ${JSON.stringify(quiet.body)}`,
  );
  const oddReminder = await call('PATCH', '/users/me', {
    token: veraToken,
    body: { defaultReminderMinutes: -5 },
  });
  check('a default reminder that is not a time before is refused', oddReminder.status === 400, `got ${oddReminder.status}`);

  const unheard = await call<{ id: string }>('POST', `/families/${familyId}/events`, {
    token: annaToken,
    body: {
      title: 'Not rung for whoever said no',
      startsAt: new Date().toISOString(),
      categoryId: 'other',
      visibility: { kind: 'family' },
    },
  });
  // Give it the time the first one had, then look: nothing may have arrived.
  await new Promise((resolve) => setTimeout(resolve, 1500));
  const veraQuiet = await bellOf(veraToken);
  check(
    'and then a family event does not reach her bell',
    unheard.status === 201 && !veraQuiet.some((r) => r.eventId === unheard.body.id),
    JSON.stringify(veraQuiet.map((r) => [r.kind, r.eventId])),
  );
  await call('PATCH', '/users/me', { token: veraToken, body: { notifyEvents: true, defaultReminderMinutes: null } });

  // -------------------------------------------------------------------------
  console.log('\n9. A forgotten password');

  const roster2 = await call<{ members: { id: string; userId: string | null; displayName: string }[] }>(
    'GET',
    `/families/${familyId}`,
    { token: annaToken },
  );
  const veraMember = roster2.body.members.find((m) => m.displayName === 'Vera');
  const annaMember = roster2.body.members.find((m) => m.displayName === 'Anna');

  const notAdmin = await call('POST', `/families/${familyId}/members/${annaMember?.id}/password-reset`, {
    token: veraToken,
  });
  check('only an admin can make a reset link', notAdmin.status === 403, `got ${notAdmin.status}`);

  const made = await call<{ link: string; expiresAt: string }>(
    'POST',
    `/families/${familyId}/members/${veraMember?.id}/password-reset`,
    { token: annaToken },
  );
  check('an admin can make one for another adult', made.status === 201, `got ${made.status}`);

  const resetToken = made.body.link?.split('/reset/')[1] ?? '';
  const checked = await call<{ valid: boolean }>('GET', `/auth/password-reset/${resetToken}`);
  check('the link checks out', checked.body?.valid === true, JSON.stringify(checked.body));

  const veraTold = await bellOf(veraToken, (rows) => rows.some((r) => r.kind === 'password_reset_created'));
  check(
    'and the person is told it exists',
    veraTold.some((r) => r.kind === 'password_reset_created' && r.actorName === 'Anna'),
    JSON.stringify(veraTold.map((r) => [r.kind, r.actorName])),
  );

  const NEW_PASSWORD = 'VeraRemembersNow2026';
  const completed2 = await call('POST', '/auth/password-reset', {
    body: { token: resetToken, password: NEW_PASSWORD },
  });
  check('the new password is set', completed2.status === 204, `got ${completed2.status}`);

  const oldSession = await call('GET', '/users/me', { token: veraToken });
  // The access token is stateless and may still be inside its 15 minutes; the
  // refresh tokens are what the reset revokes, so that is what is checked.
  check('the old access token is a JWT that may outlive the reset', [200, 401].includes(oldSession.status));

  const oldPassword = await call('POST', '/auth/email/login', {
    body: { email: email('vera'), password: PASSWORD },
  });
  check('the old password no longer works', oldPassword.status === 401, `got ${oldPassword.status}`);

  const newPassword = await call<Session>('POST', '/auth/email/login', {
    body: { email: email('vera'), password: NEW_PASSWORD },
  });
  check('the new one does', Boolean(newPassword.body?.accessToken), `got ${newPassword.status}`);

  const again = await call('POST', '/auth/password-reset', {
    body: { token: resetToken, password: 'SomethingElse2026' },
  });
  check('a link works only once', again.status === 404, `got ${again.status}`);

  // "Forgot your password?" by email: this server says whether it can, and
  // the request answers the same with or without an account. Without a mail
  // provider (the LAN host) it says so instead, and the app sends people to
  // the admin.
  const options = await call<{ byEmail: boolean }>('GET', '/auth/password-reset');
  check('the server says whether it can send a link by email', typeof options.body?.byEmail === 'boolean');
  const asked = await call<{ sent?: boolean; error?: { code: string } }>('POST', '/auth/password-reset/request', {
    body: { email: `nobody-${stamp}@example.test` },
  });
  check(
    options.body?.byEmail
      ? 'an address with no account gets the same 202 as one with'
      : 'without a mail provider the request says so, with its code',
    options.body?.byEmail
      ? asked.status === 202 && asked.body?.sent === true
      : asked.status === 503 && asked.body?.error?.code === 'mail_unavailable',
    `got ${asked.status} ${JSON.stringify(asked.body)}`,
  );

  // A phone's push token: what it must look like, and gone again on signing out.
  const badToken = await call<{ error: { code: string } }>('POST', '/users/me/devices', {
    token: annaToken,
    body: { platform: 'ios', token: 'not-a-token', locale: 'lv' },
  });
  check(
    'a push token that is not one is refused, with its code',
    badToken.status === 400 && badToken.body?.error?.code === 'invalid_token',
    `got ${badToken.status} ${JSON.stringify(badToken.body)}`,
  );
  const phoneToken = `${stamp}`.padStart(64, 'a').replace(/[^0-9a-f]/g, 'b').slice(0, 64);
  const registered = await call('POST', '/users/me/devices', {
    token: annaToken,
    body: { platform: 'ios', token: phoneToken, locale: 'lv' },
  });
  check('a phone registers its push token', registered.status === 204, `got ${registered.status}`);
  const unregistered = await call('DELETE', `/users/me/devices/${phoneToken}`, { token: annaToken });
  check('and signing out takes it back', unregistered.status === 204, `got ${unregistered.status}`);

  // -------------------------------------------------------------------------
  console.log('\n10. A custom audience — groups and people together');

  // The reset revoked Vera's sessions; the new sign-in is her token from here.
  const vera2 = newPassword.body.accessToken;
  const veraSeesNow = async () =>
    (
      await call<{ items: { id: string }[] }>('GET', `/families/${familyId}/events`, {
        token: vera2,
      })
    ).body.items.map((e) => e.id);

  const namedVera = await call<{
    id: string;
    visibilityKind: string;
    visibility: { groupId: string | null; memberId: string | null }[];
  }>('POST', `/families/${familyId}/events`, {
    token: annaToken,
    body: {
      title: 'Parents and Vera',
      startsAt: new Date().toISOString(),
      categoryId: 'celebration',
      visibility: { kind: 'custom', groupIds: [parentsGroup!.id], memberIds: [veraMember!.id] },
    },
  });
  check(
    'a custom audience is saved with its group AND its person',
    namedVera.body?.visibilityKind === 'custom' &&
      namedVera.body.visibility.some((v) => v.groupId === parentsGroup!.id) &&
      namedVera.body.visibility.some((v) => v.memberId === veraMember!.id),
    JSON.stringify(namedVera.body?.visibility),
  );

  const parentsCustom = await call<{ id: string }>('POST', `/families/${familyId}/events`, {
    token: annaToken,
    body: {
      title: 'Parents, the custom way',
      startsAt: new Date().toISOString(),
      categoryId: 'health',
      visibility: { kind: 'custom', groupIds: [parentsGroup!.id], memberIds: [] },
    },
  });

  const veraCustom = await veraSeesNow();
  check('the person named in it sees it', veraCustom.includes(namedVera.body.id));
  check(
    'a custom audience she is not in stays hidden from her',
    !veraCustom.includes(parentsCustom.body.id),
  );

  const nobody = await call<{ visibilityKind: string }>('POST', `/families/${familyId}/events`, {
    token: annaToken,
    body: {
      title: 'Aimed at somebody who is not here',
      startsAt: new Date().toISOString(),
      categoryId: 'other',
      visibility: { kind: 'custom', groupIds: [], memberIds: ['not_a_member_of_anything'] },
    },
  });
  check(
    'an audience of nobody in this family is saved as private, not refused with a 500',
    nobody.status === 201 && nobody.body?.visibilityKind === 'private',
    `got ${nobody.status} ${JSON.stringify(nobody.body)}`,
  );

  // -------------------------------------------------------------------------
  console.log('\n11. What changed since you last looked');

  const firstVisit = await call<{ previousSeenAt: string | null }>(
    'POST',
    `/families/${familyId}/me/seen`,
    { token: vera2 },
  );
  check(
    'a first visit has nothing before it',
    firstVisit.status === 200 && firstVisit.body?.previousSeenAt === null,
    `got ${firstVisit.status} ${JSON.stringify(firstVisit.body)}`,
  );

  const secondVisit = await call<{ previousSeenAt: string | null }>(
    'POST',
    `/families/${familyId}/me/seen`,
    { token: vera2 },
  );
  const sinceFirst = Date.now() - Date.parse(secondVisit.body?.previousSeenAt ?? '');
  check(
    'the next one answers with when the first began',
    sinceFirst >= 0 && sinceFirst < 60_000,
    JSON.stringify(secondVisit.body),
  );

  const rosterNow = await call<{ members: Record<string, unknown>[] }>('GET', `/families/${familyId}`, {
    token: annaToken,
  });
  check(
    'and nobody else can read when she last looked',
    !JSON.stringify(rosterNow.body).includes('lastSeenAt'),
  );

  // -------------------------------------------------------------------------
  console.log('\n12. A repeating event and the calendar feed');

  // Tuesdays at 18:00 in Riga, starting a week ago: the reminder has to be
  // for the coming Tuesday, not for last week's.
  const lastTuesday = new Date();
  lastTuesday.setUTCDate(lastTuesday.getUTCDate() - 7);
  const practice = await call<{ id: string; repeat: string | null; repeatTimeZone: string | null }>(
    'POST',
    `/families/${familyId}/events`,
    {
      token: annaToken,
      body: {
        title: 'Swimming practice',
        startsAt: lastTuesday.toISOString(),
        categoryId: 'activity',
        visibility: { kind: 'family' },
        repeat: 'weekly',
        repeatTimeZone: 'Europe/Riga',
        reminder: { minutesBefore: 60 },
      },
    },
  );
  check(
    'a weekly series is saved as one event with its rule and zone',
    practice.status === 201 &&
      practice.body?.repeat === 'weekly' &&
      practice.body.repeatTimeZone === 'Europe/Riga',
    `got ${practice.status} ${JSON.stringify(practice.body)}`,
  );

  const practiceRead = await call<{ reminders: { scheduledFor: string }[] }>(
    'GET',
    `/families/${familyId}/events/${practice.body.id}`,
    { token: annaToken },
  );
  const reminderAt = Date.parse(practiceRead.body?.reminders?.[0]?.scheduledFor ?? '');
  check(
    "its reminder is for the next occurrence, not last week's",
    reminderAt > Date.now() && reminderAt < Date.now() + 8 * 24 * 60 * 60 * 1000,
    JSON.stringify(practiceRead.body?.reminders),
  );

  const series = await call<{ items: { id: string }[] }>(
    'GET',
    `/families/${familyId}/events?repeating=true`,
    { token: vera2 },
  );
  check(
    'the series is listed on its own, whatever its date',
    series.body.items.length === 1 && series.body.items[0].id === practice.body.id,
    JSON.stringify(series.body.items.map((e) => e.id)),
  );

  const refused = await call('POST', `/families/${familyId}/events`, {
    token: annaToken,
    body: { title: 'Fortnightly', startsAt: new Date().toISOString(), categoryId: 'other', repeat: 'fortnightly' },
  });
  check('a rule the server does not know is refused, not saved as once', refused.status === 400);

  const feed = await call<{ url: string; webcalUrl: string }>(
    'GET',
    `/families/${familyId}/calendar-feed`,
    { token: vera2 },
  );
  check(
    'a member gets a calendar address, and a webcal one',
    feed.status === 200 && feed.body.url.endsWith('.ics') && feed.body.webcalUrl.startsWith('webcal://'),
    JSON.stringify(feed.body),
  );

  const feedPath = feed.body.url.slice(feed.body.url.indexOf('/v1/') + 3);
  const ics = await fetch(`${BASE}${feedPath}`);
  const icsText = await ics.text();
  check(
    'the address answers with a calendar, no token needed',
    ics.status === 200 && (ics.headers.get('content-type') ?? '').startsWith('text/calendar'),
    `got ${ics.status} ${ics.headers.get('content-type')}`,
  );
  check(
    'it carries the series as one entry that repeats, in its own zone',
    icsText.includes('SUMMARY:Swimming practice') &&
      icsText.includes('RRULE:FREQ=WEEKLY') &&
      icsText.includes('DTSTART;TZID=Europe/Riga:'),
    icsText.slice(0, 400),
  );
  check(
    'and only what that member can see',
    !icsText.includes('Parents only') && !icsText.includes('Anna only'),
  );
  check('with the birthdays in it', icsText.includes('19501120'), icsText.slice(0, 200));

  const reset = await call<{ url: string }>('POST', `/families/${familyId}/calendar-feed/reset`, {
    token: vera2,
  });
  const oldAddress = await fetch(`${BASE}${feedPath}`);
  check(
    'after a reset the old address stops working',
    reset.status === 200 && reset.body.url !== feed.body.url && oldAddress.status === 404,
    `reset ${reset.status}, old address ${oldAddress.status}`,
  );

  // -------------------------------------------------------------------------
  console.log('\n13. Time capsules, surprises, the story shelf, an heirloom');

  const eventsPath = `/families/${familyId}/events`;
  const inTwoDays = new Date(Date.now() + 2 * 86_400_000).toISOString();
  const surprise = await call<{ id: string }>('POST', eventsPath, {
    token: annaToken,
    body: {
      title: 'Wishes for Vera',
      description: 'Happy birthday from Anna.',
      startsAt: inTwoDays,
      categoryId: 'celebration',
      visibility: { kind: 'family' },
      surpriseFor: veraMember!.id,
      revealAt: inTwoDays,
    },
  });
  check(
    'a surprise is made for somebody in the family',
    surprise.status === 201,
    `got ${surprise.status} ${JSON.stringify(surprise.body)}`,
  );

  const veraBefore = await call<{ items: { id: string }[] }>('GET', `${eventsPath}?limit=50`, { token: vera2 });
  const veraIds = (veraBefore.body?.items ?? []).map((e) => e.id);
  check(
    'the one it is for cannot see it before its day',
    veraBefore.status === 200 && !veraIds.includes(surprise.body.id),
    JSON.stringify(veraIds),
  );
  // The NULL trap, in real SQL: written as a NOT, the rule would have hidden
  // every ordinary event from everybody as well.
  check('while every ordinary event is still there for her', veraIds.includes(publicEvent.body.id), JSON.stringify(veraIds));
  const veraOpens = await call('GET', `${eventsPath}/${surprise.body.id}`, { token: vera2 });
  check('nor can she open it by its id', veraOpens.status === 403, `got ${veraOpens.status}`);
  const annaBefore = await call<{ items: { id: string }[] }>('GET', `${eventsPath}?limit=50`, { token: annaToken });
  check('the rest of the family can', (annaBefore.body?.items ?? []).some((e) => e.id === surprise.body.id));
  const forHerself = await call('POST', eventsPath, {
    token: annaToken,
    body: { title: 'x', startsAt: inTwoDays, categoryId: 'celebration', surpriseFor: annaMember!.id, revealAt: inTwoDays },
  });
  check('and nobody makes one for themselves', forHerself.status === 400, `got ${forHerself.status}`);

  const inAYear = new Date(Date.now() + 365 * 86_400_000).toISOString();
  const capsule = await call<{ id: string }>('POST', eventsPath, {
    token: annaToken,
    body: {
      title: 'For Vera, next year',
      description: 'Words inside the capsule',
      startsAt: new Date().toISOString(),
      categoryId: 'other',
      visibility: { kind: 'family' },
      sealedUntil: inAYear,
    },
  });
  check('a time capsule is sealed', capsule.status === 201, `got ${capsule.status} ${JSON.stringify(capsule.body)}`);
  const envelope = await call<{ sealed: boolean; description: string | null; title: string }>(
    'GET',
    `${eventsPath}/${capsule.body.id}`,
    { token: vera2 },
  );
  check(
    'the family sees the envelope and nothing inside it',
    envelope.status === 200 &&
      envelope.body.sealed === true &&
      envelope.body.description === null &&
      envelope.body.title === 'For Vera, next year',
    JSON.stringify(envelope.body),
  );
  const inside = await call<{ sealed: boolean; description: string | null }>(
    'GET',
    `${eventsPath}/${capsule.body.id}`,
    { token: annaToken },
  );
  check(
    'its author reads what they wrote',
    inside.body?.sealed === false && inside.body?.description === 'Words inside the capsule',
    JSON.stringify(inside.body),
  );
  const peekNote = await call('POST', `${eventsPath}/${capsule.body.id}/comments`, {
    token: vera2,
    body: { body: 'Can I peek?' },
  });
  check('nobody writes on it before it opens', peekNote.status === 403, `got ${peekNote.status}`);
  const peek = await call<{ items: { id: string }[] }>('GET', `${eventsPath}?q=capsule`, { token: vera2 });
  check(
    'a search for the words inside finds nothing',
    peek.status === 200 && !(peek.body?.items ?? []).some((e) => e.id === capsule.body.id),
    JSON.stringify(peek.body),
  );
  const ownPeek = await call<{ items: { id: string }[] }>('GET', `${eventsPath}?q=capsule`, { token: annaToken });
  check('which its author can', (ownPeek.body?.items ?? []).some((e) => e.id === capsule.body.id));
  const early = await call('POST', `${eventsPath}/${capsule.body.id}/share-links`, {
    token: annaToken,
    body: { days: 7 },
  });
  check('and it does not leave the family early, even by its author', early.status === 403, `got ${early.status}`);

  const tale = await call<{ id: string }>('POST', eventsPath, {
    token: annaToken,
    body: {
      title: 'The bear who could not sleep',
      startsAt: new Date().toISOString(),
      categoryId: 'other',
      visibility: { kind: 'family' },
      onStoryShelf: true,
    },
  });
  const shelf = await call<{ items: { id: string; onStoryShelf: boolean }[] }>(
    'GET',
    `${eventsPath}?onStoryShelf=true`,
    { token: vera2 },
  );
  const shelved = shelf.body?.items ?? [];
  check(
    'the story shelf lists its own and nothing else',
    tale.status === 201 && shelved.some((e) => e.id === tale.body.id) && shelved.every((e) => e.onStoryShelf),
    JSON.stringify(shelved),
  );

  const sticker = await call<{ url: string; expiresAt: string; heirloom: boolean }>(
    'POST',
    `${eventsPath}/${publicEvent.body.id}/share-links`,
    { token: annaToken, body: { heirloom: true } },
  );
  check(
    'an heirloom sticker is made to last a century',
    sticker.status === 201 &&
      sticker.body.heirloom === true &&
      new Date(sticker.body.expiresAt).getTime() - Date.now() > 99 * 365 * 86_400_000,
    `got ${sticker.status} ${JSON.stringify(sticker.body)}`,
  );
  const scanned = await call<{ heirloom: boolean; event: { title: string; voiceNotes: unknown[] } }>(
    'GET',
    `/guest/${sticker.body?.url?.split('/guest/')[1] ?? ''}`,
  );
  check(
    'and whoever scans it gets the story, with room for its voice',
    scanned.status === 200 && scanned.body.heirloom === true && Array.isArray(scanned.body.event.voiceNotes),
    `got ${scanned.status} ${JSON.stringify(scanned.body)}`,
  );

  // -------------------------------------------------------------------------
  console.log('\n14. A wish list, a guest link, a face, and in memoriam');

  // Anna writes a wish for herself; Vera writes an idea for Anna and claims it.
  const annaOwn = await call<{ id: string }>('POST', `/families/${familyId}/members/${annaMember!.id}/wishes`, {
    token: annaToken,
    body: { text: 'A warm scarf' },
  });
  const veraIdea = await call<{ id: string }>('POST', `/families/${familyId}/members/${annaMember!.id}/wishes`, {
    token: vera2,
    body: { text: 'The blue one from the market' },
  });
  const claimed = await call<{ claimedByMemberId: string | null }>(
    'POST',
    `/families/${familyId}/wishes/${annaOwn.body.id}/claim`,
    { token: vera2 },
  );
  check('a wish is added and claimed', claimed.body?.claimedByMemberId === veraMember!.id, JSON.stringify(claimed.body));

  const annaList = await call<{ id: string; claimedByMemberId: string | null }[]>(
    'GET',
    `/families/${familyId}/members/${annaMember!.id}/wishes`,
    { token: annaToken },
  );
  check(
    'the person it is for sees only her own line, and not that it is claimed',
    annaList.body.length === 1 && annaList.body[0].id === annaOwn.body.id && annaList.body[0].claimedByMemberId === null,
    JSON.stringify(annaList.body),
  );
  const annaPeek = await call('DELETE', `/families/${familyId}/wishes/${veraIdea.body.id}`, { token: annaToken });
  check('and cannot even find the idea written for her', annaPeek.status === 404, `got ${annaPeek.status}`);

  // What somebody likes, and a gift idea taken (docs/07-IMPROVEMENTS.md item 91).
  const liked = await call<{ interests: string[] }>('PATCH', `/families/${familyId}/me`, {
    token: annaToken,
    body: { interests: ['garden', 'astrology', 'garden', 'reading'] },
  });
  check(
    'your interests are kept as known keys, each once',
    liked.status === 200 && JSON.stringify(liked.body?.interests) === '["garden","reading"]',
    `got ${liked.status} ${JSON.stringify(liked.body?.interests)}`,
  );
  const notAList = await call('PATCH', `/families/${familyId}/me`, { token: annaToken, body: { interests: 'garden' } });
  check('interests that are not a list are refused', notAList.status === 400, `got ${notAList.status}`);

  const forEmily = await call<{ interests: string[] }>(
    'PATCH',
    `/families/${familyId}/members/${child.body.id}/interests`,
    { token: annaToken, body: { interests: ['drawing', 'animals'] } },
  );
  check(
    "the parent who manages a child's profile sets what the child likes",
    forEmily.status === 200 && forEmily.body?.interests?.length === 2,
    `got ${forEmily.status}`,
  );
  const veraForEmily = await call('PATCH', `/families/${familyId}/members/${child.body.id}/interests`, {
    token: vera2,
    body: { interests: ['tech'] },
  });
  check('a grandparent does not', veraForEmily.status === 403, `got ${veraForEmily.status}`);
  const forAnAdult = await call('PATCH', `/families/${familyId}/members/${veraMember!.id}/interests`, {
    token: annaToken,
    body: { interests: ['tech'] },
  });
  check("nor does anybody set an adult's", forAnAdult.status === 403, `got ${forAnAdult.status}`);

  const taken = await call<{ claimedByMemberId: string | null }>(
    'POST',
    `/families/${familyId}/members/${annaMember!.id}/wishes`,
    { token: vera2, body: { text: 'A reading lamp', claim: true } },
  );
  check(
    'a gift idea is taken in one step, claimed by whoever took it',
    taken.status === 201 && taken.body?.claimedByMemberId === veraMember!.id,
    `got ${taken.status} ${JSON.stringify(taken.body)}`,
  );
  const annaAfter = await call<{ text: string }[]>('GET', `/families/${familyId}/members/${annaMember!.id}/wishes`, {
    token: annaToken,
  });
  check(
    'and the person it is for never sees it',
    !annaAfter.body.some((w) => w.text === 'A reading lamp'),
    JSON.stringify(annaAfter.body),
  );

  // A guest link to the whole-family event.
  const shared = await call<{ url: string }>('POST', `/families/${familyId}/events/${publicEvent.body.id}/share-links`, {
    token: annaToken,
    body: { days: 1 },
  });
  const guestToken = shared.body?.url?.split('/guest/')[1] ?? '';
  const guest = await call<{ event: { title: string }; familyName: string }>('GET', `/guest/${guestToken}`);
  check(
    'a guest link opens the one event, without an account',
    // Section 5 renamed it ("..., corrected").
    guest.status === 200 && Boolean(guest.body?.event?.title?.startsWith('For the whole family')),
    `got ${guest.status} ${JSON.stringify(guest.body)}`,
  );
  check('and shows nobody in it', !JSON.stringify(guest.body).includes('memberId'));

  const notMine = await call('POST', `/families/${familyId}/events/${publicEvent.body.id}/share-links`, {
    token: vera2,
    body: { days: 1 },
  });
  check('somebody who can only see it cannot hand it on', notMine.status === 403, `got ${notMine.status}`);

  const links = await call<{ id: string }[]>('GET', `/families/${familyId}/events/${publicEvent.body.id}/share-links`, {
    token: annaToken,
  });
  await call('DELETE', `/families/${familyId}/share-links/${links.body[0]?.id}`, { token: annaToken });
  const afterRevoke = await call('GET', `/guest/${guestToken}`);
  check('a withdrawn link stops working at once', afterRevoke.status === 404, `got ${afterRevoke.status}`);

  // A face: a real JPEG in, a signed WebP out.
  const face = await sharp({ create: { width: 900, height: 600, channels: 3, background: { r: 90, g: 140, b: 200 } } })
    .jpeg()
    .toBuffer();
  const avatarPut = await fetch(`${BASE}/families/${familyId}/members/${annaMember!.id}/avatar`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${annaToken}`, 'Content-Type': 'image/jpeg' },
    body: face,
  });
  const avatar = (await avatarPut.json()) as { avatarUrl?: string };
  const avatarFile = avatar.avatarUrl ? await fetch(avatar.avatarUrl.replace(/^https?:\/\/[^/]+\/v1/, BASE)) : null;
  const avatarMeta = avatarFile && avatarFile.ok ? await sharp(Buffer.from(await avatarFile.arrayBuffer())).metadata() : null;
  check(
    'a profile photograph goes up and comes back as a 512px square',
    avatarPut.status === 200 && avatarMeta?.width === 512 && avatarMeta?.height === 512,
    `put ${avatarPut.status}, file ${avatarFile?.status}, ${avatarMeta?.width}x${avatarMeta?.height}`,
  );
  const rosterFaces = await call<{ members: { id: string; avatarUrl: string | null; avatarKey?: string }[] }>(
    'GET',
    `/families/${familyId}`,
    { token: vera2 },
  );
  const annaRow = rosterFaces.body.members.find((m) => m.id === annaMember!.id);
  check(
    'the family sees it as a signed link, never as a storage key',
    Boolean(annaRow?.avatarUrl?.includes('signature=')) && !('avatarKey' in (annaRow ?? {})),
    JSON.stringify(annaRow),
  );
  const notHers = await fetch(`${BASE}/families/${familyId}/members/${annaMember!.id}/avatar`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${vera2}`, 'Content-Type': 'image/jpeg' },
    body: face,
  });
  check("nobody changes another adult's photograph", notHers.status === 403, `got ${notHers.status}`);

  // In memoriam, last: it ends Vera's sessions.
  const marked = await call<{ diedOn: string | null }>(
    'PATCH',
    `/families/${familyId}/members/${veraMember!.id}/memorial`,
    { token: annaToken, body: { diedOn: new Date().toISOString() } },
  );
  check('an admin can mark somebody as having died', marked.status === 200 && Boolean(marked.body?.diedOn), `got ${marked.status}`);

  const stillThere = await call<{ members: { id: string }[] }>('GET', `/families/${familyId}`, { token: annaToken });
  check(
    'and the profile stays in the family',
    stillThere.body.members.some((m) => m.id === veraMember!.id),
  );
  const veraAfterDeath = await call('GET', `/families/${familyId}/events`, { token: vera2 });
  check(
    'while the account can no longer open the family',
    veraAfterDeath.status === 403,
    `got ${veraAfterDeath.status}`,
  );

  // -------------------------------------------------------------------------
  console.log('\n15. Usage counts and error reports');

  // Read back from the database itself: the point of these tables is what is
  // NOT in them, and only the rows can show that. Against another server
  // (SMOKE_BASE_URL) that is its database, SMOKE_DATABASE_URL - without it
  // these are skipped rather than read from the wrong one.
  const remote = Boolean(process.env.SMOKE_BASE_URL) && !process.env.SMOKE_DATABASE_URL;
  const db = new PrismaClient(
    process.env.SMOKE_DATABASE_URL ? { datasourceUrl: process.env.SMOKE_DATABASE_URL } : undefined,
  );
  if (remote) console.log('  skipped: the rows are on the other server (set SMOKE_DATABASE_URL)');
  else try {
    const sent = await call('POST', '/telemetry/events', {
      token: annaToken,
      body: {
        familyId,
        events: [
          { name: 'comment_added', at: new Date().toISOString() },
          { name: 'event_viewed', props: { eventId: publicEvent.body.id } },
          { name: 'not_an_event_the_app_has' },
        ],
      },
    });
    check('a batch of usage counts is taken', sent.status === 204, `got ${sent.status}`);

    const anonymous = await call('POST', '/telemetry/events', { body: { events: [{ name: 'comment_added' }] } });
    check('counts need a session', anonymous.status === 401, `got ${anonymous.status}`);

    const kept = await db.analyticsEvent.findMany({
      where: { familyId, createdAt: { gte: new Date(Date.now() - 5 * 60_000) } },
    });
    check(
      'kept under the family, with only the names the app has',
      kept.length === 2 && kept.every((row) => row.name === 'comment_added' || row.name === 'event_viewed'),
      JSON.stringify(kept.map((row) => row.name)),
    );
    check(
      'and without the event it was about, or anybody in it',
      !JSON.stringify(kept).includes(publicEvent.body.id) && !JSON.stringify(kept).includes(annaMember!.id),
      JSON.stringify(kept),
    );

    const token = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6';
    const reported = await call('POST', '/telemetry/errors', {
      body: {
        message: `smoke ${stamp}: failed /v1/guest/${token}`,
        platform: 'web',
        route: `/guest/${token}`,
        appVersion: '0.1.0',
      },
    });
    check('an error report is taken without a session', reported.status === 204, `got ${reported.status}`);
    const errorRow = await db.clientError.findFirst({ where: { message: { contains: `smoke ${stamp}` } } });
    check(
      'kept without the key that was in it',
      Boolean(errorRow) && !JSON.stringify(errorRow).includes(token) && errorRow?.route === '/guest/:id',
      JSON.stringify(errorRow),
    );

    const off = await call<{ shareUsageStats: boolean }>('PATCH', '/users/me', {
      token: annaToken,
      body: { shareUsageStats: false },
    });
    check(
      'counting can be switched off',
      off.status === 200 && off.body?.shareUsageStats === false,
      JSON.stringify(off.body),
    );
    await call('POST', '/telemetry/events', {
      token: annaToken,
      body: { familyId, events: [{ name: 'group_created' }] },
    });
    const afterOff = await db.analyticsEvent.count({ where: { familyId, name: 'group_created' } });
    check('and then nothing is kept, whatever the app sends', afterOff === 0, `found ${afterOff}`);
  } finally {
    await db.$disconnect();
  }

  // -------------------------------------------------------------------------
  console.log('\n16. A voice note');

  const told = await call<{ id: string }>('POST', `/families/${familyId}/events`, {
    token: annaToken,
    body: {
      title: 'Grandma tells how the house was built',
      startsAt: new Date().toISOString(),
      categoryId: 'milestone',
      visibility: { kind: 'family' },
    },
  });
  // Not a real recording: nothing on the server decodes one, and a voice note
  // is the kind of file that has nothing to check but its type and size.
  const voice = Buffer.from(`OggS${'x'.repeat(4000)}`);
  const voiceTarget = await call<{ attachmentId: string; uploadUrl: string; maxBytes: number }>(
    'POST',
    `/families/${familyId}/events/${told.body.id}/uploads`,
    { token: annaToken, body: { mimeType: 'audio/webm', sizeBytes: voice.length, durationSec: 42 } },
  );
  check(
    'a voice note is taken, under its own ceiling',
    voiceTarget.status === 201 && voiceTarget.body?.maxBytes === 10 * 1024 * 1024,
    `got ${voiceTarget.status} ${JSON.stringify(voiceTarget.body)}`,
  );

  const voicePut = await fetch(voiceTarget.body.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'audio/webm' },
    body: voice,
  });
  const voiceDone = await call<{ kind: string; durationSec: number; thumbnailKey: string | null }>(
    'POST',
    `/families/${familyId}/uploads/${voiceTarget.body.attachmentId}/complete`,
    { token: annaToken },
  );
  check(
    'it arrives as audio with its length, and no thumbnail is attempted',
    voicePut.status === 204 &&
      voiceDone.body?.kind === 'audio' &&
      voiceDone.body?.durationSec === 42 &&
      voiceDone.body?.thumbnailKey === null,
    JSON.stringify(voiceDone.body),
  );

  const toldBack = await call<{ attachments: { id: string; kind: string; url?: string }[] }>(
    'GET',
    `/families/${familyId}/events/${told.body.id}`,
    { token: annaToken },
  );
  const voiceUrl = toldBack.body.attachments?.find((a) => a.kind === 'audio')?.url ?? '';
  const firstBytes = await fetch(voiceUrl, { headers: { Range: 'bytes=0-3' } });
  check(
    'a player gets it in pieces, the way Safari asks',
    firstBytes.status === 206 &&
      firstBytes.headers.get('content-range') === `bytes 0-3/${voice.length}` &&
      firstBytes.headers.get('content-type') === 'audio/webm' &&
      (await firstBytes.text()) === 'OggS',
    `got ${firstBytes.status} ${firstBytes.headers.get('content-range')}`,
  );

  const toldShared = await call<{ url: string }>(
    'POST',
    `/families/${familyId}/events/${told.body.id}/share-links`,
    { token: annaToken, body: { days: 1 } },
  );
  const toldGuest = await call<{ event: { photos: unknown[] } }>(
    'GET',
    `/guest/${toldShared.body?.url?.split('/guest/')[1] ?? ''}`,
  );
  check(
    "a guest link to the event does not carry the voice - that stays in the family",
    toldGuest.status === 200 && toldGuest.body?.event?.photos?.length === 0,
    JSON.stringify(toldGuest.body?.event),
  );

  const unsaid = await call('DELETE', `/families/${familyId}/attachments/${voiceTarget.body.attachmentId}`, {
    token: annaToken,
  });
  const afterUnsaid = await fetch(voiceUrl);
  const toldAgain = await call<{ attachments: unknown[] }>(
    'GET',
    `/families/${familyId}/events/${told.body.id}`,
    { token: annaToken },
  );
  check(
    'taken out, it is gone - the row and the file',
    unsaid.status === 204 && toldAgain.body?.attachments?.length === 0 && afterUnsaid.status === 404,
    `delete ${unsaid.status}, file ${afterUnsaid.status}`,
  );

  // -------------------------------------------------------------------------
  console.log(`\n${passed} ok, ${failed} FAIL\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('\nThe smoke test failed:', error);
  process.exit(1);
});
