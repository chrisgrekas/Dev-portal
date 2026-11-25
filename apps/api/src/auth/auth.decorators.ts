import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';

export type Role = 'admin' | 'editor' | 'viewer';
export interface Principal {
  kind: 'user' | 'apikey';
  id: number;
  name: string; // email ή όνομα API key — χρησιμοποιείται ως author
  role: Role;
}

export const IS_PUBLIC = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const ROLES = 'roles';
/** Ποιοι ρόλοι επιτρέπονται. Χωρίς @Roles: αρκεί να είσαι συνδεδεμένος (και viewer). */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES, roles);

/** Ο συνδεδεμένος χρήστης/σύστημα. Για author στο ιστορικό. */
export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): Principal => ctx.switchToHttp().getRequest().principal,
);

export const authorOf = (p: Principal) => (p.kind === 'apikey' ? `apikey:${p.name}` : p.name);
