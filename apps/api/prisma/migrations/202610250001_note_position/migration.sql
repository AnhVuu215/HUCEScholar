BEGIN;
-- READ-04: a page note may be pinned to a point on its page, shown there as a sticky note.
-- The point is {coordinateSpace, point:[x,y]} in the unrotated page box, normalized 0..1 with
-- PDF's upward y axis, like highlight quads. A page note without a point stays panel-only.
ALTER TABLE hucescholar.annotations DROP CONSTRAINT annotations_check;
ALTER TABLE hucescholar.annotations ADD CONSTRAINT ck_annotation_kind_anchor CHECK (
  (
    kind = 'PAGE_NOTE' AND btrim(content) <> '' AND (
      anchor IS NULL OR (
        jsonb_typeof(anchor) = 'object'
        AND anchor - 'coordinateSpace' - 'point' = '{}'::jsonb
        AND anchor->>'coordinateSpace' = 'normalized-pdf-v1'
        AND jsonb_typeof(anchor->'point') = 'array'
        AND jsonb_array_length(anchor->'point') = 2
        AND CASE
          WHEN jsonb_typeof(anchor->'point'->0) = 'number'
            AND jsonb_typeof(anchor->'point'->1) = 'number'
          THEN (anchor->'point'->>0)::numeric BETWEEN 0 AND 1
            AND (anchor->'point'->>1)::numeric BETWEEN 0 AND 1
          ELSE false
        END
      )
    )
  ) OR (
    kind = 'TEXT_HIGHLIGHT' AND anchor IS NOT NULL AND jsonb_typeof(anchor) = 'object'
    AND anchor ? 'quads' AND jsonb_typeof(anchor->'quads') = 'array'
    AND jsonb_array_length(anchor->'quads') > 0
  )
);
COMMENT ON COLUMN hucescholar.annotations.anchor IS
  'Highlight: quads và quote; ghi chú trang: điểm ghim (tùy chọn). Trên trang gốc chưa xoay, chuẩn hóa 0..1';
COMMIT;
