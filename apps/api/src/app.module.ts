import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { AcademicModule } from './academic/academic.module';
import { MaterialsModule } from './materials/materials.module';

@Module({
  imports: [DatabaseModule, AuthModule, UsersModule, AcademicModule, MaterialsModule],
  controllers: [HealthController],
})
export class AppModule {}
