import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateHighlightDto, UpdateHighlightDto } from '../src/materials/highlight.dto';

const create = {
  pageNumber: 1,
  content: 'Ghi chú riêng',
  anchor: {
    coordinateSpace: 'normalized-pdf-v1',
    quote: 'Đoạn văn đã chọn',
    quads: [[0.1, 0.8, 0.6, 0.8, 0.6, 0.75, 0.1, 0.75]],
  },
  requestId: '72ea1970-b1fa-40d7-a67e-cce781823b5e',
};

describe('highlight color write contract', () => {
  it.each(['#FFF59D', '#A5D6A7', '#90CAF9', '#F8BBD0', '#CE93D8', '#FFCC80', '#80CBC4', '#B0BEC5'])(
    'accepts %s for both creating and editing',
    async (color) => {
      expect(await validate(plainToInstance(CreateHighlightDto, { ...create, color }))).toEqual([]);
      expect(
        await validate(
          plainToInstance(UpdateHighlightDto, {
            color,
            content: 'Đã sửa',
            revision: 1,
          }),
        ),
      ).toEqual([]);
    },
  );

  it.each(['#ffffff', '#123456', 'red', '#FFF', 'url(https://example.test)', null])(
    'rejects unsupported or unsafe write color %s',
    async (color) => {
      for (const dto of [
        plainToInstance(CreateHighlightDto, { ...create, color }),
        plainToInstance(UpdateHighlightDto, { color, content: '', revision: 1 }),
      ])
        expect((await validate(dto)).some((error) => error.property === 'color')).toBe(true);
    },
  );
});
