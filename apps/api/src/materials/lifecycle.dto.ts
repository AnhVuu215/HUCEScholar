import { IsBoolean, IsIn, IsOptional, IsString, Matches } from 'class-validator';
import { DraftListDto, WithdrawMaterialDto } from './materials.dto';
export class LifecycleListDto extends DraftListDto {
  @IsOptional() @IsIn(['VISIBLE', 'HIDDEN']) visibility?: string;
  @IsOptional() @IsIn(['LECTURER_MATERIAL', 'STUDENT_SUPPLEMENT']) kind?: string;
}
export class TransferMaterialDto extends WithdrawMaterialDto {
  @IsString() @Matches(/^[1-9]\d{0,18}$/) recipientId!: string;
}
export class MaterialVisibilityDto extends WithdrawMaterialDto {
  @IsIn(['VISIBLE', 'HIDDEN']) visibility!: string;
  @IsOptional() @IsBoolean() resolved?: boolean;
}
