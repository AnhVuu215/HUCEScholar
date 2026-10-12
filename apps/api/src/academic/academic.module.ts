import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AcademicController } from './academic.controller';
import { AcademicService } from './academic.service';
import { AssignmentsController, OwnAssignmentsController } from './assignments.controller';
import { AssignmentsService } from './assignments.service';
@Module({
  imports: [AuthModule],
  controllers: [AcademicController, AssignmentsController, OwnAssignmentsController],
  providers: [AcademicService, AssignmentsService],
})
export class AcademicModule {}
