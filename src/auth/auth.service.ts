import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { verifyFirebaseToken } from './firebase-token';
import { JwtPayload } from './types/jwt-payload';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const password = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: { email: dto.email, name: dto.name, password },
    });

    return this.buildAuthResponse(user);
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    // No password means the account was created with an external provider.
    if (!user || !user.password) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await bcrypt.compare(dto.password, user.password);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.buildAuthResponse(user);
  }

  async googleLogin(idToken: string) {
    const projectId = this.config.getOrThrow<string>('FIREBASE_PROJECT_ID');

    let claims;
    try {
      claims = await verifyFirebaseToken(idToken, projectId);
    } catch {
      throw new UnauthorizedException('Invalid Google token');
    }

    const email = claims.email;
    const firebaseUid = claims.sub;
    if (!email || !firebaseUid) {
      throw new UnauthorizedException('Google token is missing an email');
    }

    // Find-or-create by email; link the Firebase uid so future logins match.
    const user = await this.prisma.user.upsert({
      where: { email },
      update: { firebaseUid, avatarUrl: claims.picture },
      create: {
        email,
        name: claims.name ?? email.split('@')[0],
        provider: 'GOOGLE',
        firebaseUid,
        avatarUrl: claims.picture,
      },
    });

    return this.buildAuthResponse(user);
  }

  private buildAuthResponse(user: {
    id: string;
    email: string;
    name: string;
    role: Role;
  }) {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };
    return {
      accessToken: this.jwt.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    };
  }
}
