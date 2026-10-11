import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';

@Module({ imports: [DatabaseModule, AuthModule, UsersModule], controllers: [HealthController] })
export class AppModule {}
