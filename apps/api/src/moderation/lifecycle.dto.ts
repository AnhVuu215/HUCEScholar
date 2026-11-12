import { IsBoolean, IsIn, IsOptional } from 'class-validator';
import { DraftListDto, WithdrawMaterialDto } from '../drafts/materials.dto';
export class LifecycleListDto extends DraftListDto {
  @IsOptional() @IsIn(['VISIBLE', 'HIDDEN']) visibility?: string;
}
export class MaterialVisibilityDto extends WithdrawMaterialDto {
  @IsIn(['VISIBLE', 'HIDDEN']) visibility!: string;
  @IsOptional() @IsBoolean() resolved?: boolean;
}
