import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MemberRole, MemberStatus, VisibilityKind } from '@prisma/client';
import { randomInt } from 'node:crypto';

import { AuditService } from '../../common/audit.service';
import { LIMITS, requiredText } from '../../common/input';
import { cleanInterests } from '../../common/interests';
import { PrismaService } from '../../common/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { effectivePlan } from '../subscriptions/premium';
import { VisibilityService, type ViewerContext } from '../visibility/visibility.service';

/** System groups created with the family. `icon` is the stable key for code. */
const SYSTEM_GROUPS = [
  { name: 'Parents', icon: 'parents' },
  { name: 'Children', icon: 'children' },
  { name: 'Grandparents', icon: 'grandparents' },
] as const;

const INVITATION_TTL_MS = 14 * 24 * 60 * 60 * 1000;

/** The oldest birthday accepted. A chronicle reaches great-grandparents, not further. */
const FIRST_BIRTH_YEAR = 1900;
/**
 * Slack past "now" for a birthday picked today. The app stores a date as local
 * noon, and noon today west of UTC is still later than the server's clock.
 */
const CLOCK_SLACK_MS = 24 * 60 * 60 * 1000;

/**
 * A birthday from a request, checked before anything is written.
 *
 * The app's picker cannot produce a bad one, but the API is not only the
 * picker. A string that is not a date would reach Prisma as an Invalid Date and
 * fail inside the transaction; a year like 2096 or 196 is a typo that would sit
 * on somebody's profile for good. Absent is fine — a birthday is optional.
 */
export function parseBirthDate(value: unknown): Date | null {
  if (value === undefined || value === null || value === '') return null;

  const date = typeof value === 'string' ? new Date(value) : new Date(NaN);
  if (
    Number.isNaN(date.getTime()) ||
    date.getTime() > Date.now() + CLOCK_SLACK_MS ||
    date.getUTCFullYear() < FIRST_BIRTH_YEAR
  ) {
    throw new BadRequestException({
      code: 'invalid_birth_date',
      message: `A birth date must be a real day between ${FIRST_BIRTH_YEAR} and today.`,
    });
  }
  return date;
}

/** As long as the app's field allows (create-family.tsx, family/edit.tsx). */
export const FAMILY_NAME_MAX = 60;

/**
 * A family's name, the line at the top of everybody's timeline. Before this,
 * "   " was saved as an empty name, a number in the body was a 500 from
 * `.trim()`, and nothing stopped a name a hundred kilobytes long.
 */
export function familyName(value: unknown): string {
  const name = typeof value === 'string' ? value.trim() : '';
  if (!name || name.length > FAMILY_NAME_MAX) {
    throw new BadRequestException({
      code: 'invalid_name',
      message: `A family's name is 1 to ${FAMILY_NAME_MAX} characters.`,
    });
  }
  return name;
}

/** The languages the app speaks; anything else is not a family's language. */
function familyLocale(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (value === 'en' || value === 'lv') return value;
  throw new BadRequestException({ code: 'invalid_locale', message: 'A family speaks "lv" or "en".' });
}

@Injectable()
export class FamiliesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly visibility: VisibilityService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  // -------------------------------------------------------------------------
  // The family
  // -------------------------------------------------------------------------

  /**
   * Creates the family, its administrator and the three system groups in one
   * transaction.
   *
   * The system groups exist from the start rather than on demand: without a
   * "Parents" group the safe default for children's events does not work, and
   * that is a regulatory requirement, not a convenience.
   */
  async create(
    userId: string,
    input: { name: string; locale?: string; birthDate?: string; interests?: unknown },
  ) {
    // The creator's own birthday, from "About you". That screen runs before the
    // family exists, so this is the first moment there is a row to put it on.
    // The same for what they said they like, the step after it.
    const birthDate = parseBirthDate(input.birthDate);
    const interests = cleanInterests(input.interests) ?? [];
    const name = familyName(input.name);
    const locale = familyLocale(input.locale);

    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { displayName: true, locale: true },
    });

    return this.prisma.$transaction(async (tx) => {
      const family = await tx.family.create({
        data: { name, locale: locale ?? user.locale },
      });

      const admin = await tx.member.create({
        data: {
          familyId: family.id,
          userId,
          displayName: user.displayName,
          birthDate,
          interests,
          role: MemberRole.admin,
          status: MemberStatus.active,
        },
      });

      for (const group of SYSTEM_GROUPS) {
        await tx.group.create({
          data: {
            familyId: family.id,
            name: group.name,
            icon: group.icon,
            isSystem: true,
            // The family's creator joins Parents: they are the one who will manage children.
            members: group.icon === 'parents' ? { create: { memberId: admin.id } } : undefined,
          },
        });
      }

      return tx.family.findUniqueOrThrow({
        where: { id: family.id },
        include: {
          members: { include: { groupLinks: { select: { groupId: true } } } },
          groups: { include: { members: { select: { memberId: true } } } },
        },
      });
    });
  }

  async findOne(ctx: ViewerContext) {
    const [family, blocks] = await Promise.all([
      this.prisma.family.findUniqueOrThrow({
        where: { id: ctx.familyId },
        include: {
          members: {
            where: { status: { not: MemberStatus.removed } },
            include: { groupLinks: { select: { groupId: true } } },
            orderBy: { joinedAt: 'asc' },
          },
          groups: {
            include: { members: { select: { memberId: true } } },
            orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
          },
          subscription: {
            select: {
              plan: true,
              status: true,
              period: true,
              currentPeriodEnd: true,
              cancelAtPeriodEnd: true,
              store: true,
            },
          },
        },
      }),
      // Whom the reader blocked (docs/02-DATA-MODEL.md, Blocks). Their own
      // list, on their own copy of the family: nobody learns who blocked them.
      this.prisma.memberBlock.findMany({
        where: { blockerMemberId: ctx.memberId },
        select: { blockedMemberId: true },
        orderBy: { createdAt: 'asc' },
      }),
    ]);
    return {
      ...family,
      // The plan in force now, not the row's word for it: a period that ended
      // is the free plan even before the webhook that says so (premium.ts).
      plan: effectivePlan(family.subscription),
      blockedMemberIds: blocks.map((b) => b.blockedMemberId),
    };
  }

  async update(ctx: ViewerContext, patch: { name?: string; coverUrl?: string; locale?: string }) {
    this.visibility.assertCan(ctx, 'family.edit');
    const name = patch.name !== undefined ? familyName(patch.name) : undefined;
    const locale = familyLocale(patch.locale);
    return this.prisma.family.update({
      where: { id: ctx.familyId },
      data: {
        ...(name ? { name } : {}),
        ...(patch.coverUrl !== undefined ? { coverUrl: patch.coverUrl } : {}),
        ...(locale ? { locale } : {}),
      },
    });
  }

  // -------------------------------------------------------------------------
  // Members
  // -------------------------------------------------------------------------

  /**
   * Creating a child profile. A child has no account — only a record in the
   * family with a named manager.
   */
  async createChild(
    ctx: ViewerContext,
    input: { displayName: string; birthDate?: string; managedByMemberId?: string },
  ) {
    this.visibility.assertCan(ctx, 'member.invite');
    const birthDate = parseBirthDate(input.birthDate);

    const guardianId = input.managedByMemberId ?? ctx.memberId;
    const guardian = await this.prisma.member.findFirst({
      where: { id: guardianId, familyId: ctx.familyId, status: MemberStatus.active },
      select: { id: true, role: true },
    });

    if (!guardian) {
      throw new BadRequestException({
        code: 'guardian_not_found',
        message: 'Guardian must be an active member of this family.',
      });
    }
    // A child cannot manage a child, and a viewer cannot be the responsible person.
    if (guardian.role === MemberRole.child || guardian.role === MemberRole.viewer) {
      throw new BadRequestException({
        code: 'invalid_guardian_role',
        message: 'Only an admin or a member can manage a child profile.',
      });
    }

    const childrenGroup = await this.prisma.group.findFirst({
      where: { familyId: ctx.familyId, isSystem: true, icon: 'children' },
      select: { id: true },
    });

    const child = await this.prisma.member.create({
      data: {
        familyId: ctx.familyId,
        userId: null,
        displayName: requiredText(input.displayName, LIMITS.personName, 'invalid_display_name', "A child's name"),
        birthDate,
        role: MemberRole.child,
        status: MemberStatus.active,
        managedByMemberId: guardian.id,
        ...(childrenGroup ? { groupLinks: { create: { groupId: childrenGroup.id } } } : {}),
      },
    });

    await this.audit.record({
      familyId: ctx.familyId,
      action: 'child_profile.updated',
      entityType: 'Member',
      entityId: child.id,
      metadata: { created: true, guardianId: guardian.id },
    });

    return child;
  }

  /**
   * The caller's own face in this family: the name everybody sees, and the
   * birthday the family is reminded of.
   *
   * Until this existed, both were fixed at onboarding. A typo in a name, a
   * birthday skipped on the first screen, a nickname the family actually uses
   * - none of them could be changed, and the birthday strip (item 46) made the
   * second one visible to everybody every year.
   *
   * No capability check beyond membership: this is your own row, and a viewer
   * or a grandparent may correct their own name as much as an admin may. A
   * child profile is not reachable here - it has no account to sign in with,
   * so it can never be "me".
   */
  async updateOwnProfile(
    ctx: ViewerContext,
    input: { displayName?: unknown; birthDate?: unknown; interests?: unknown },
  ) {
    const data: { displayName?: string; birthDate?: Date | null; interests?: string[] } = {};

    if (input.displayName !== undefined) {
      const name = typeof input.displayName === 'string' ? input.displayName.trim() : '';
      // The same floor the app enforces (apps/mobile/src/lib/form.ts): one
      // letter reads as a mistake to everybody who sees it on the timeline.
      if (name.length < 2 || name.length > 60) {
        throw new BadRequestException({
          code: 'invalid_display_name',
          message: 'A name needs between 2 and 60 characters.',
        });
      }
      data.displayName = name;
    }

    // `null` clears it - a birthday somebody would rather not share is a
    // choice, not a missing field.
    if (input.birthDate !== undefined) data.birthDate = parseBirthDate(input.birthDate);

    // What you like, for gift ideas: known keys only (common/interests.ts).
    if (input.interests !== undefined) {
      const interests = cleanInterests(input.interests);
      if (!interests) {
        throw new BadRequestException({ code: 'invalid_interests', message: 'Interests are a list.' });
      }
      data.interests = interests;
    }

    if (Object.keys(data).length === 0) {
      throw new BadRequestException({ code: 'nothing_to_update', message: 'Nothing to update.' });
    }

    const member = await this.prisma.member.findUniqueOrThrow({
      where: { id: ctx.memberId },
      select: { userId: true },
    });

    const [updated] = await this.prisma.$transaction([
      this.prisma.member.update({ where: { id: ctx.memberId }, data }),
      // The account's name follows, so a new family made later starts with the
      // name this person actually chose rather than the one they first typed.
      ...(data.displayName && member.userId
        ? [
            this.prisma.user.update({
              where: { id: member.userId },
              data: { displayName: data.displayName },
            }),
          ]
        : []),
    ]);

    return updated;
  }

  /**
   * What a child likes, for gift ideas before their birthday. A child has no
   * account to say it with, so the adults who manage the profile do: the
   * parent it is managed by, or an admin - as with the rest of a child
   * profile, and written to the audit log like the rest of a child's data.
   */
  async updateChildInterests(ctx: ViewerContext, memberId: string, input: unknown) {
    const interests = cleanInterests(input);
    if (!interests) {
      throw new BadRequestException({ code: 'invalid_interests', message: 'Interests are a list.' });
    }

    const member = await this.requireMember(ctx.familyId, memberId);
    if (member.role !== MemberRole.child) {
      // An adult says what they like themselves (PATCH /families/:id/me).
      throw new ForbiddenException({ code: 'not_a_child_profile', message: 'Only a child profile.' });
    }
    if (ctx.role !== MemberRole.admin && member.managedByMemberId !== ctx.memberId) {
      throw new ForbiddenException({ code: 'insufficient_role', message: 'Only whoever manages the profile.' });
    }

    const updated = await this.prisma.member.update({ where: { id: memberId }, data: { interests } });

    await this.audit.record({
      familyId: ctx.familyId,
      action: 'child_profile.updated',
      entityType: 'Member',
      entityId: memberId,
      metadata: { field: 'interests', count: interests.length },
    });

    return updated;
  }

  async updateRole(ctx: ViewerContext, memberId: string, role: MemberRole) {
    this.visibility.assertCan(ctx, 'member.edit_role');

    const member = await this.requireMember(ctx.familyId, memberId);

    // The last administrator must not lose their capabilities — otherwise the
    // family is left with nobody who can invite, manage groups or cancel the plan.
    if (member.role === MemberRole.admin && role !== MemberRole.admin) {
      const admins = await this.prisma.member.count({
        where: { familyId: ctx.familyId, role: MemberRole.admin, status: MemberStatus.active },
      });
      if (admins <= 1) {
        throw new ForbiddenException({
          code: 'last_admin',
          message: 'A family must keep at least one admin.',
        });
      }
    }

    const updated = await this.prisma.member.update({ where: { id: memberId }, data: { role } });

    await this.audit.record({
      familyId: ctx.familyId,
      action: 'member.role_changed',
      entityType: 'Member',
      entityId: memberId,
      metadata: { from: member.role, to: role },
    });

    return updated;
  }

  /**
   * A member is not deleted, only marked. Their events and comments stay in the
   * family chronicle — a person can leave a family, the family's history cannot.
   */
  async remove(ctx: ViewerContext, memberId: string) {
    this.visibility.assertCan(ctx, 'member.remove');

    if (memberId === ctx.memberId) {
      throw new BadRequestException({
        code: 'cannot_remove_self',
        message: 'Use "leave family" instead.',
      });
    }

    const member = await this.requireMember(ctx.familyId, memberId);

    if (member.role === MemberRole.admin) {
      const admins = await this.prisma.member.count({
        where: { familyId: ctx.familyId, role: MemberRole.admin, status: MemberStatus.active },
      });
      if (admins <= 1) {
        throw new ForbiddenException({
          code: 'last_admin',
          message: 'A family must keep at least one admin.',
        });
      }
    }

    // For a child profile the manager passes to whoever performs the removal —
    // a child's data must never be left without a responsible person.
    await this.prisma.member.updateMany({
      where: { managedByMemberId: memberId },
      data: { managedByMemberId: ctx.memberId },
    });

    const removed = await this.prisma.member.update({
      where: { id: memberId },
      data: { status: MemberStatus.removed },
    });

    await this.audit.record({
      familyId: ctx.familyId,
      action: 'member.removed',
      entityType: 'Member',
      entityId: memberId,
      metadata: { role: member.role },
    });

    return removed;
  }

  /**
   * IN MEMORIAM: mark that somebody has died - or take it back, because a
   * mistake here is one nobody should have to live with.
   *
   * The profile and everything it is part of stay exactly as they were: the
   * chronicle is about them too. What stops is everything that treats them as
   * present - the birthday strip (the app), reminders and notifications
   * (notifications.service.ts), the calendar feed, and signing in: an account
   * that outlives its person is the one somebody else might use, so its
   * sessions end here and contextFor() will not let it back into the family.
   *
   * An admin's decision, and never about yourself. A child whose guardian has
   * died passes to whoever is marking it, as it does on removal - a child's
   * data is never left without a responsible adult.
   */
  async setDiedOn(ctx: ViewerContext, memberId: string, value: string | null) {
    this.visibility.assertCan(ctx, 'member.edit_role');

    if (memberId === ctx.memberId) {
      throw new BadRequestException({
        code: 'cannot_mark_self',
        message: 'Another admin in the family can do this.',
      });
    }

    const member = await this.requireMember(ctx.familyId, memberId);
    const diedOn = value === null ? null : parseBirthDate(value);
    if (value !== null && !diedOn) {
      throw new BadRequestException({ code: 'invalid_date', message: 'A date is needed.' });
    }
    if (diedOn && member.birthDate && diedOn.getTime() < member.birthDate.getTime()) {
      throw new BadRequestException({
        code: 'invalid_date',
        message: 'That day is before they were born.',
      });
    }

    if (diedOn && member.role === MemberRole.admin) {
      const admins = await this.prisma.member.count({
        where: {
          familyId: ctx.familyId,
          role: MemberRole.admin,
          status: MemberStatus.active,
          diedOn: null,
        },
      });
      if (admins <= 1) {
        throw new ForbiddenException({
          code: 'last_admin',
          message: 'A family must keep at least one admin.',
        });
      }
    }

    if (diedOn) {
      await this.prisma.member.updateMany({
        where: { managedByMemberId: memberId },
        data: { managedByMemberId: ctx.memberId },
      });
    }

    const updated = await this.prisma.member.update({
      where: { id: memberId },
      data: { diedOn },
      include: { groupLinks: { select: { groupId: true } } },
    });

    if (diedOn && member.userId) {
      const now = new Date();
      await this.prisma.$transaction([
        this.prisma.refreshToken.updateMany({
          where: { userId: member.userId, revokedAt: null },
          data: { revokedAt: now },
        }),
        this.prisma.device.deleteMany({ where: { userId: member.userId } }),
        this.prisma.calendarFeed.deleteMany({ where: { memberId } }),
      ]);
    }

    await this.audit.record({
      familyId: ctx.familyId,
      action: diedOn ? 'member.marked_deceased' : 'member.unmarked_deceased',
      entityType: 'Member',
      entityId: memberId,
      metadata: { role: member.role },
    });

    return updated;
  }

  // -------------------------------------------------------------------------
  // Grupas
  // -------------------------------------------------------------------------

  async createGroup(ctx: ViewerContext, input: { name: string; memberIds?: string[] }) {
    this.visibility.assertCan(ctx, 'group.manage');
    const name = requiredText(input.name, LIMITS.groupName, 'invalid_name', "A group's name");

    const memberIds = await this.filterFamilyMembers(ctx.familyId, input.memberIds ?? []);

    return this.prisma.group.create({
      data: {
        familyId: ctx.familyId,
        name,
        isSystem: false,
        members: { create: memberIds.map((memberId) => ({ memberId })) },
      },
      include: { members: { select: { memberId: true } } },
    });
  }

  async updateGroup(
    ctx: ViewerContext,
    groupId: string,
    patch: { name?: string; memberIds?: string[] },
  ) {
    this.visibility.assertCan(ctx, 'group.manage');
    const group = await this.requireGroup(ctx.familyId, groupId);

    if (patch.name && group.isSystem) {
      throw new ForbiddenException({
        code: 'system_group_immutable',
        message: 'System groups cannot be renamed.',
      });
    }
    // "   " was saved as a group with no name.
    const name =
      patch.name !== undefined ? requiredText(patch.name, LIMITS.groupName, 'invalid_name', "A group's name") : undefined;

    return this.prisma.$transaction(async (tx) => {
      if (patch.memberIds) {
        const memberIds = await this.filterFamilyMembers(ctx.familyId, patch.memberIds);
        await tx.groupMember.deleteMany({ where: { groupId } });
        await tx.groupMember.createMany({
          data: memberIds.map((memberId) => ({ groupId, memberId })),
        });
      }

      return tx.group.update({
        where: { id: groupId },
        data: name ? { name } : {},
        include: { members: { select: { memberId: true } } },
      });
    });
  }

  /**
   * Deleting a group.
   *
   * FAIL CLOSED: events that were visible ONLY to this group become private to
   * their author — not visible to everyone. Deleting a group never opens data
   * wider than it was.
   */
  /**
   * A visit begins: remember when, and say when the previous one began.
   *
   * The app calls this at launch and on coming back after a while away, and
   * counts what the others added since `previousSeenAt` (apps/mobile/src/
   * domain/whats-new.ts). Kept in MemberVisit, not on the member row, so it is
   * nobody's business but this person's - see the schema.
   */
  async markSeen(ctx: ViewerContext): Promise<{ previousSeenAt: string | null }> {
    const now = new Date();
    const previous = await this.prisma.memberVisit.findUnique({
      where: { memberId: ctx.memberId },
      select: { lastSeenAt: true },
    });
    await this.prisma.memberVisit.upsert({
      where: { memberId: ctx.memberId },
      create: { memberId: ctx.memberId, lastSeenAt: now },
      update: { lastSeenAt: now },
    });
    return { previousSeenAt: previous?.lastSeenAt.toISOString() ?? null };
  }

  async deleteGroup(ctx: ViewerContext, groupId: string) {
    this.visibility.assertCan(ctx, 'group.manage');
    const group = await this.requireGroup(ctx.familyId, groupId);

    if (group.isSystem) {
      throw new ForbiddenException({
        code: 'system_group_immutable',
        message: 'System groups cannot be deleted.',
      });
    }

    await this.prisma.$transaction(async (tx) => {
      // `custom` too: an audience of this group plus nobody else is left with
      // no rows once the group goes, and should say `private` rather than
      // carry a kind that suggests somebody else can see it.
      const affected = await tx.event.findMany({
        where: {
          familyId: ctx.familyId,
          visibilityKind: { in: [VisibilityKind.groups, VisibilityKind.custom] },
          visibility: { some: { groupId } },
        },
        select: { id: true, visibility: { select: { groupId: true, memberId: true } } },
      });

      const orphaned = affected
        .filter(
          (e) =>
            e.visibility.filter((v) => v.memberId || (v.groupId && v.groupId !== groupId))
              .length === 0,
        )
        .map((e) => e.id);

      if (orphaned.length > 0) {
        await tx.event.updateMany({
          where: { id: { in: orphaned } },
          data: { visibilityKind: VisibilityKind.private },
        });
      }

      // EventVisibility rindas aiziet ar onDelete: Cascade.
      await tx.group.delete({ where: { id: groupId } });
    });
  }

  // -------------------------------------------------------------------------
  // Invitations
  // -------------------------------------------------------------------------

  async invite(
    ctx: ViewerContext,
    input: { email?: string; role: MemberRole; groupIds?: string[] },
  ) {
    this.visibility.assertCan(ctx, 'member.invite');

    // A child profile is not invited — it is created (createChild).
    if (input.role === MemberRole.child) {
      throw new BadRequestException({
        code: 'child_cannot_be_invited',
        message: 'Create a child profile instead of inviting one.',
      });
    }

    const groupIds = await this.filterFamilyGroups(ctx.familyId, input.groupIds ?? []);

    const invitation = await this.prisma.invitation.create({
      data: {
        familyId: ctx.familyId,
        email: input.email ? input.email.trim().toLowerCase() : null,
        code: await this.uniqueCode(),
        role: input.role,
        groupIds,
        invitedByMemberId: ctx.memberId,
        expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
      },
    });

    await this.audit.record({
      familyId: ctx.familyId,
      action: 'invitation.created',
      entityType: 'Invitation',
      entityId: invitation.id,
      metadata: { role: input.role, hasEmail: Boolean(input.email) },
    });

    return invitation;
  }

  /**
   * The public preview before joining.
   *
   * Returns ONLY the family name and the role. A member list, an event count
   * or anything else would be a data leak here: an invitation code can be
   * guessed or forwarded.
   */
  async previewInvitation(code: string) {
    const invitation = await this.prisma.invitation.findUnique({
      where: { code: code.trim().toUpperCase() },
      select: {
        role: true,
        expiresAt: true,
        acceptedAt: true,
        revokedAt: true,
        family: { select: { name: true } },
      },
    });

    if (!invitation || invitation.revokedAt || invitation.acceptedAt) {
      throw new NotFoundException({ code: 'invitation_not_found', message: 'Invitation not found.' });
    }
    if (invitation.expiresAt < new Date()) {
      throw new NotFoundException({ code: 'invitation_expired', message: 'Invitation expired.' });
    }

    return { familyName: invitation.family.name, role: invitation.role };
  }

  async acceptInvitation(
    userId: string,
    code: string,
    input: { birthDate?: string; interests?: unknown } = {},
  ) {
    // The joiner's own birthday and interests, from onboarding — see `create`.
    const birthDate = parseBirthDate(input.birthDate);
    const interests = cleanInterests(input.interests) ?? [];

    const invitation = await this.prisma.invitation.findUnique({
      where: { code: code.trim().toUpperCase() },
    });

    if (!invitation || invitation.revokedAt || invitation.acceptedAt) {
      throw new NotFoundException({ code: 'invitation_not_found', message: 'Invitation not found.' });
    }
    if (invitation.expiresAt < new Date()) {
      throw new NotFoundException({ code: 'invitation_expired', message: 'Invitation expired.' });
    }

    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { displayName: true },
    });

    const joined = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.member.findFirst({
        where: { familyId: invitation.familyId, userId },
      });

      // Re-joining after removal restores the same record — so the old events
      // and comments stay attached to one person.
      const member = existing
        ? await tx.member.update({
            where: { id: existing.id },
            data: {
              status: MemberStatus.active,
              role: invitation.role,
              // Only when one was given: re-joining without "About you" must not
              // wipe the birthday the old record already has.
              ...(birthDate ? { birthDate } : {}),
              ...(interests.length ? { interests } : {}),
            },
          })
        : await tx.member.create({
            data: {
              familyId: invitation.familyId,
              userId,
              displayName: user.displayName,
              birthDate,
              interests,
              role: invitation.role,
              status: MemberStatus.active,
            },
          });

      for (const groupId of invitation.groupIds) {
        await tx.groupMember.upsert({
          where: { groupId_memberId: { groupId, memberId: member.id } },
          create: { groupId, memberId: member.id },
          update: {},
        });
      }

      await tx.invitation.update({
        where: { id: invitation.id },
        data: { acceptedAt: new Date() },
      });

      return member;
    });

    // The admins sent the invitation; this is the moment it worked. After the
    // transaction, so nobody is told about a membership that rolled back.
    void this.notifications.memberJoined(invitation.familyId, joined.id);

    return joined;
  }

  async revokeInvitation(ctx: ViewerContext, invitationId: string) {
    this.visibility.assertCan(ctx, 'member.invite');
    const invitation = await this.prisma.invitation.findFirst({
      where: { id: invitationId, familyId: ctx.familyId },
    });
    if (!invitation) {
      throw new NotFoundException({ code: 'invitation_not_found', message: 'Invitation not found.' });
    }
    return this.prisma.invitation.update({
      where: { id: invitationId },
      data: { revokedAt: new Date() },
    });
  }

  listInvitations(ctx: ViewerContext) {
    this.visibility.assertCan(ctx, 'member.invite');
    return this.prisma.invitation.findMany({
      where: { familyId: ctx.familyId, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private async requireMember(familyId: string, memberId: string) {
    const member = await this.prisma.member.findFirst({
      where: { id: memberId, familyId },
      select: { id: true, role: true, status: true, userId: true, birthDate: true, managedByMemberId: true },
    });
    if (!member) {
      throw new NotFoundException({ code: 'member_not_found', message: 'Member not found.' });
    }
    return member;
  }

  private async requireGroup(familyId: string, groupId: string) {
    const group = await this.prisma.group.findFirst({
      where: { id: groupId, familyId },
      select: { id: true, isSystem: true },
    });
    if (!group) {
      throw new NotFoundException({ code: 'group_not_found', message: 'Group not found.' });
    }
    return group;
  }

  /** Never trust ids supplied by the client — they may point at another family. */
  private async filterFamilyMembers(familyId: string, ids: string[]): Promise<string[]> {
    if (ids.length === 0) return [];
    const rows = await this.prisma.member.findMany({
      where: { familyId, id: { in: ids }, status: { not: MemberStatus.removed } },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  private async filterFamilyGroups(familyId: string, ids: string[]): Promise<string[]> {
    if (ids.length === 0) return [];
    const rows = await this.prisma.group.findMany({
      where: { familyId, id: { in: ids } },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  /** Format FAM-1234. No look-alike 0/O and 1/I — the code gets read out over the phone. */
  private async uniqueCode(): Promise<string> {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    for (let attempt = 0; attempt < 10; attempt++) {
      const body = Array.from({ length: 4 }, () => alphabet[randomInt(alphabet.length)]).join('');
      const code = `FAM-${body}`;
      const taken = await this.prisma.invitation.findUnique({ where: { code }, select: { id: true } });
      if (!taken) return code;
    }
    throw new Error('Could not generate a unique invitation code.');
  }
}
