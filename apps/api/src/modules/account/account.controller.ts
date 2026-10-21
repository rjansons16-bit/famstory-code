import { Controller, Delete, Get, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';

import { CurrentUser, type AuthenticatedUser } from '../identity/jwt-auth.guard';
import { AccountService } from './account.service';

/**
 * The account's own endpoints: take my data out, and close it.
 *
 * Both sit under /v1/users/me next to the profile, and both require a signed-in
 * session - they act on whoever is holding the token and take no id, so there
 * is no version of these routes that can be pointed at somebody else.
 */
@Controller('v1/users/me')
export class AccountController {
  constructor(private readonly account: AccountService) {}

  /**
   * GDPR Art. 15 and 20. Free for every plan - see the service.
   *
   * Sent as a download with a dated filename rather than a JSON body: the
   * point of the right to portability is a file a person keeps, and what a
   * browser does with an untyped body is open it in a tab.
   */
  @Get('data-export')
  async export(
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const file = await this.account.exportFor(user.id, contextFrom(req));
    const day = file.exportedAt.slice(0, 10);

    res
      .status(200)
      .setHeader('Content-Type', 'application/json; charset=utf-8')
      .setHeader('Content-Disposition', `attachment; filename="famstory-export-${day}.json"`)
      // The family's own data must not sit in a shared cache on the way.
      .setHeader('Cache-Control', 'no-store')
      .send(JSON.stringify(file, null, 2));
  }

  /**
   * GDPR Art. 17, with the 30-day grace period the schema and
   * docs/06-PRIVACY-GDPR.md both specify. Signing in during those 30 days
   * brings the account back (identity/auth.service.ts).
   */
  @Delete()
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ): Promise<{ deletedAt: string; purgeAt: string }> {
    const { deletedAt, purgeAt } = await this.account.requestDeletion(
      user.id,
      contextFrom(req),
    );

    return { deletedAt: deletedAt.toISOString(), purgeAt: purgeAt.toISOString() };
  }
}

function contextFrom(req: Request): { ip?: string; userAgent?: string } {
  return {
    ip: req.ip ?? req.socket.remoteAddress ?? undefined,
    userAgent: req.headers['user-agent'],
  };
}
