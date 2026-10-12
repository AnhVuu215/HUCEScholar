import { IsIn } from 'class-validator';
import { DraftListDto } from './materials.dto';
export class PersonalListDto extends DraftListDto {
  override limit = 12;
}
export class SaveDocumentDto {
  @IsIn([true]) saved!: boolean;
}
