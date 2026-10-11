import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';

@Module({ imports: [DatabaseModule, AuthModule], controllers: [HealthController] })
export class AppModule {}
