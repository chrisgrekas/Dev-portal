import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Post, UnauthorizedException, ConflictException } from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { JwtService } from '@nestjs/jwt';
import { IsEmail, IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { eq } from 'drizzle-orm';
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { InjectDb } from '../db/db.module';
import type { DB } from '../db/client';
import { apiKeys, users } from '../db/schema';
import { CurrentUser, Principal, Public, Role, Roles } from './auth.decorators';
import { hashKey } from './auth.guard';

const ROLE_LIST: Role[] = ['admin', 'editor', 'viewer'];

class LoginDto {
  @ApiProperty({ example: 'admin@example.com' }) @IsEmail() email: string;
  @ApiProperty({ example: 'admin123' }) @IsString() password: string;
}
class CreateUserDto {
  @ApiProperty() @IsEmail() email: string;
  @ApiProperty() @IsString() @MinLength(8) password: string;
  @ApiPropertyOptional({ enum: ROLE_LIST }) @IsOptional() @IsIn(ROLE_LIST) role?: Role;
}
class CreateApiKeyDto {
  @ApiProperty({ example: 'myclaim-sync' }) @IsString() name: string;
  @ApiPropertyOptional({ enum: ROLE_LIST, default: 'viewer' }) @IsOptional() @IsIn(ROLE_LIST) role?: Role;
}

@ApiTags('auth')
@Controller()
export class AuthController {
  constructor(@InjectDb() private db: DB, private jwt: JwtService) {}

  @Public() @Post('auth/login') @HttpCode(200)
  async login(@Body() dto: LoginDto) {
    const [u] = await this.db.select().from(users).where(eq(users.email, dto.email.toLowerCase()));
    if (!u || !(await bcrypt.compare(dto.password, u.passwordHash))) throw new UnauthorizedException('Invalid credentials');
    const accessToken = await this.jwt.signAsync({ sub: u.id, email: u.email, role: u.role });
    return { accessToken, user: { id: u.id, email: u.email, role: u.role } };
  }

  @ApiBearerAuth() @Get('auth/me')
  me(@CurrentUser() p: Principal) {
    return p;
  }

  @ApiBearerAuth() @Roles('admin') @Post('users')
  async createUser(@Body() dto: CreateUserDto) {
    const email = dto.email.toLowerCase();
    const [exists] = await this.db.select({ id: users.id }).from(users).where(eq(users.email, email));
    if (exists) throw new ConflictException('User exists');
    const [u] = await this.db.insert(users)
      .values({ email, passwordHash: await bcrypt.hash(dto.password, 10), role: dto.role ?? 'viewer' })
      .returning({ id: users.id, email: users.email, role: users.role });
    return u;
  }

  @ApiBearerAuth() @Roles('admin') @Get('users')
  listUsers() {
    return this.db.select({ id: users.id, email: users.email, role: users.role, createdAt: users.createdAt }).from(users);
  }

  /** Δημιουργεί API key. Το key επιστρέφεται ΜΟΝΟ μία φορά — στη βάση μένει μόνο το hash. */
  @ApiBearerAuth() @Roles('admin') @Post('api-keys')
  async createKey(@Body() dto: CreateApiKeyDto) {
    const key = 'dp_' + randomBytes(24).toString('hex');
    const [row] = await this.db.insert(apiKeys)
      .values({ name: dto.name, hashedKey: hashKey(key), role: dto.role ?? 'viewer' })
      .returning({ id: apiKeys.id, name: apiKeys.name, role: apiKeys.role });
    return { ...row, key, note: 'Store this key now — it will not be shown again.' };
  }

  @ApiBearerAuth() @Roles('admin') @Get('api-keys')
  listKeys() {
    return this.db.select({ id: apiKeys.id, name: apiKeys.name, role: apiKeys.role, createdAt: apiKeys.createdAt, lastUsedAt: apiKeys.lastUsedAt }).from(apiKeys);
  }

  @ApiBearerAuth() @Roles('admin') @Delete('api-keys/:id')
  async deleteKey(@Param('id', ParseIntPipe) id: number) {
    await this.db.delete(apiKeys).where(eq(apiKeys.id, id));
    return { deleted: id };
  }
}
