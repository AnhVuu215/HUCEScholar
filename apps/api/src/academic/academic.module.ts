import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AcademicController } from './academic.controller';
import { AcademicService } from './academic.service';
@Module({ imports: [AuthModule], controllers: [AcademicController], providers: [AcademicService] })
export class AcademicModule {}
