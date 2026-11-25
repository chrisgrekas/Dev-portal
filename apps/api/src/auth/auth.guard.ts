import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { eq } from 'drizzle-orm';
import { createHash } from 'crypto';
import { InjectDb } from '../db/db.module';
import type { DB } from '../db/client';
import { apiKeys } from '../db/schema';
import { IS_PUBLIC, Principal, Role, ROLES } from './auth.decorators';

export const hashKey = (key: string) => createHash('sha256').update(key).digest('hex');

/**
 * Global guard: ΚΑΘΕ endpoint θέλει είτε
 *  - Authorization: Bearer <JWT>  (χρήστες)
 *  - X-API-Key: <key>             (συστήματα)
 * εκτός αν έχει @Public().
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private reflector: Reflector, private jwt: JwtService, @InjectDb() private db: DB) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const req = ctx.switchToHttp().getRequest();
    const principal = await this.authenticate(req);
    if (!principal) throw new UnauthorizedException('Missing or invalid token / API key');
    req.principal = principal;

    const roles = this.reflector.getAllAndOverride<Role[]>(ROLES, targets);
    if (roles && !roles.includes(principal.role)) throw new ForbiddenException(`Requires role: ${roles.join(' or ')}`);
    return true;
  }

  private async authenticate(req: any): Promise<Principal | null> {
    const apiKey = req.headers['x-api-key'];
    if (typeof apiKey === 'string' && apiKey) {
      const [row] = await this.db.select().from(apiKeys).where(eq(apiKeys.hashedKey, hashKey(apiKey)));
      if (!row) return null;
      await this.db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, row.id));
      return { kind: 'apikey', id: row.id, name: row.name, role: row.role };
    }
    const auth = req.headers['authorization'];
    if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
      try {
        const p = await this.jwt.verifyAsync(auth.slice(7));
        return { kind: 'user', id: p.sub, name: p.email, role: p.role };
      } catch {
        return null;
      }
    }
    return null;
  }
}
