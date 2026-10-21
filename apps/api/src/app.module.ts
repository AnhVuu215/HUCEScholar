import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { AcademicModule } from './academic/academic.module';
import { MaterialsModule } from './materials/materials.module';
import { AccountModule } from './account/account.module';
import { OpsModule } from './ops/ops.module';
import { NotificationsModule } from './notifications/notifications.module';

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    UsersModule,
    AcademicModule,
    MaterialsModule,
    AccountModule,
    OpsModule,
    NotificationsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
