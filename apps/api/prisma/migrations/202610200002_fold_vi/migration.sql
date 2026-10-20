BEGIN;
-- SEARCH-01: accent-insensitive Vietnamese search for the library.
-- Folding happens at query time so no table, column or version-protection trigger changes.
-- Mirrors foldVietnamese() in apps/api/src/materials/search-fold.ts; an integration test
-- compares both for every Vietnamese letter.
CREATE FUNCTION hucescholar.fold_vi(value text) RETURNS text
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS $$
  SELECT lower(translate(value,
    'AEIOUYÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚÝàáâãèéêìíòóôõùúýĂăĐđĨĩŨũƠơƯưẠạẢảẤấẦầẨẩẪẫẬậẮắẰằẲẳẴẵẶặẸẹẺẻẼẽẾếỀềỂểỄễỆệỈỉỊịỌọỎỏỐốỒồỔổỖỗỘộỚớỜờỞởỠỡỢợỤụỦủỨứỪừỬửỮữỰựỲỳỴỵỶỷỸỹ',
    'aeiouyaaaaeeeiioooouuyaaaaeeeiioooouuyaaddiiuuoouuaaaaaaaaaaaaaaaaaaaaaaaaeeeeeeeeeeeeeeeeiiiioooooooooooooooooooooooouuuuuuuuuuuuuuyyyyyyyy'))
$$;
COMMENT ON FUNCTION hucescholar.fold_vi(text) IS
  'Bỏ dấu tiếng Việt (gồm đ/Đ) và chữ hoa để tìm kiếm không dấu.';
COMMIT;
