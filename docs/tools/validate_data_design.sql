\set ON_ERROR_STOP on
BEGIN;
SET search_path = hucescholar, pg_temp;
CREATE TEMP TABLE design_checks(name text PRIMARY KEY, passed boolean NOT NULL);
CREATE FUNCTION pg_temp.assert_true(label text, result boolean) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF result IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAILED: %', label; END IF;
  INSERT INTO design_checks VALUES (label,true);
END $$;
CREATE FUNCTION pg_temp.expect_error(label text, statement text, expected_states text[]) RETURNS void LANGUAGE plpgsql AS $$
DECLARE actual_state text; failed boolean := false;
BEGIN
  BEGIN
    EXECUTE statement;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS actual_state = RETURNED_SQLSTATE;
    IF NOT actual_state = ANY(expected_states) THEN
      RAISE EXCEPTION 'FAILED %: got SQLSTATE %, expected %', label, actual_state, expected_states;
    END IF;
    failed := true;
  END;
  IF NOT failed THEN RAISE EXCEPTION 'FAILED %: invalid write was accepted', label; END IF;
  INSERT INTO design_checks VALUES (label,true);
END $$;

INSERT INTO users(id,email,display_name,password_hash,role,status,verified_at) OVERRIDING SYSTEM VALUE VALUES
 (1,'admin@example.test','Admin','fixture-not-a-real-password-hash','ADMIN','ACTIVE',now()),
 (2,'lecturer@example.test','Lecturer','fixture-not-a-real-password-hash','LECTURER','ACTIVE',now()),
 (3,'student@example.test','Student','fixture-not-a-real-password-hash','STUDENT','ACTIVE',now()),
 (4,'newlecturer@example.test','New lecturer','fixture-not-a-real-password-hash','LECTURER','ACTIVE',now()),
 (5,'otherstudent@example.test','Other student','fixture-not-a-real-password-hash','STUDENT','ACTIVE',now());
INSERT INTO faculties(id,code,name) OVERRIDING SYSTEM VALUE VALUES(1,'TEST','Test faculty');
INSERT INTO programs(id,faculty_id,code,name) OVERRIDING SYSTEM VALUE VALUES(1,1,'TEST','Test program');
INSERT INTO courses(id,faculty_id,code,name) OVERRIDING SYSTEM VALUE VALUES(1,1,'C1','Test course 1'),(2,1,'C2','Test course 2');
INSERT INTO program_courses VALUES(1,1);
INSERT INTO lecturer_assignments(lecturer_id,course_id,assigned_by) VALUES(2,1,1),(4,1,1);
INSERT INTO documents(id,kind,created_by,manager_id) OVERRIDING SYSTEM VALUE VALUES
 (1,'LECTURER_MATERIAL',2,2),(2,'STUDENT_SUPPLEMENT',3,3),(3,'LECTURER_MATERIAL',2,2),(4,'LECTURER_MATERIAL',2,2);
INSERT INTO files(id,uploaded_by,object_key,original_name,byte_size,sha256,scan_status,page_count,has_text_layer,checked_at) OVERRIDING SYSTEM VALUE VALUES
 (1,2,'fixture/pdf1','pdf1.pdf',1000,repeat('a',64),'SAFE',10,true,now()),
 (2,3,'fixture/pdf2','pdf2.pdf',2000,repeat('b',64),'SAFE',20,true,now()),
 (3,2,'fixture/pdf3','pdf3.pdf',3000,repeat('c',64),'SAFE',5,false,now()),
 (4,2,'fixture/pdf4','pdf4.pdf',4000,repeat('d',64),'CHECKING',null,null,null),
 (5,2,'fixture/pdf5','pdf5.pdf',5000,repeat('e',64),'SAFE',18,true,now());
INSERT INTO document_versions(id,document_id,version_no,file_id,created_by,title,authors,material_type,source_reference,rights_basis) OVERRIDING SYSTEM VALUE VALUES
 (11,1,1,1,2,'Original textbook','Original author','TEXTBOOK','Self-created fixture','Test-only content'),
 (21,2,1,2,3,'Supplement','Student author','EXERCISE','Self-created fixture','Test-only content'),
 (31,3,1,3,2,'Draft PDF','Lecturer author','REFERENCE','Self-created fixture','Test-only content'),
 (41,4,1,4,2,'Checking file','Lecturer author','REFERENCE','Self-created fixture','Test-only content');
INSERT INTO version_courses VALUES(11,1),(21,1),(31,1),(41,1);

UPDATE document_versions SET review_status='SUBMITTED',revision=2 WHERE id IN(11,21);
INSERT INTO publication_requests(id,version_id,submitted_by,submitted_revision) OVERRIDING SYSTEM VALUE VALUES (1,11,2,2),(3,21,3,2);
UPDATE publication_requests SET status='APPROVED',resolved_by=1,resolved_at=now() WHERE id IN(1,3);
UPDATE document_versions SET review_status='APPROVED',revision=3 WHERE id IN(11,21);
UPDATE documents SET current_version_id=11 WHERE id=1;
UPDATE documents SET current_version_id=21 WHERE id=2;
SET CONSTRAINTS ALL IMMEDIATE;
SET CONSTRAINTS ALL DEFERRED;
INSERT INTO annotations(id,user_id,version_id,page_number,kind,content) OVERRIDING SYSTEM VALUE VALUES
 (1,3,11,2,'PAGE_NOTE','Private note'),(2,5,11,2,'PAGE_NOTE','Other private note');
INSERT INTO reading_progress(user_id,version_id,page_number) VALUES(3,11,2);
INSERT INTO saved_documents(user_id,document_id) VALUES(3,1);
INSERT INTO books(id,title,source_provider,source_url,metadata_rights_basis,managed_by) OVERRIDING SYSTEM VALUE
 VALUES(1,'External metadata only','Fixture','https://example.test/book','Test-only metadata',1);
INSERT INTO book_courses VALUES(1,1);
-- Explicit fixture IDs must not make later negative tests fail on an unrelated PK.
DO $$
DECLARE item record; maximum bigint;
BEGIN
 FOR item IN SELECT table_name,column_name FROM information_schema.columns
   WHERE table_schema='hucescholar' AND is_identity='YES' LOOP
   EXECUTE format('SELECT coalesce(max(%I),1) FROM hucescholar.%I',item.column_name,item.table_name) INTO maximum;
   PERFORM setval(pg_get_serial_sequence('hucescholar.'||item.table_name,item.column_name),maximum,true);
 END LOOP;
END $$;

SELECT pg_temp.assert_true('23_tables_created',(SELECT count(*)=23 FROM information_schema.tables WHERE table_schema='hucescholar' AND table_type='BASE TABLE'));
SELECT pg_temp.assert_true('approved_current_version',(SELECT current_version_id=11 FROM documents WHERE id=1));
SELECT pg_temp.expect_error('normalized_email', $$INSERT INTO users(email,display_name,password_hash,role) VALUES('UPPER@example.test','X','fixture','STUDENT')$$,ARRAY['23514']);
SELECT pg_temp.expect_error('unique_email', $$INSERT INTO users(email,display_name,password_hash,role) VALUES('student@example.test','X','fixture','STUDENT')$$,ARRAY['23505']);
SELECT pg_temp.expect_error('three_role_domain', $$INSERT INTO users(email,display_name,password_hash,role) VALUES('x@example.test','X','fixture','SUPERADMIN')$$,ARRAY['23514']);
SELECT pg_temp.expect_error('active_requires_verified', $$INSERT INTO users(email,display_name,password_hash,role,status) VALUES('x@example.test','X','fixture','STUDENT','ACTIVE')$$,ARRAY['23514']);
SELECT pg_temp.expect_error('unique_active_assignment', $$INSERT INTO lecturer_assignments(lecturer_id,course_id,assigned_by) VALUES(2,1,1)$$,ARRAY['23505']);
SELECT pg_temp.expect_error('current_version_same_document', $$UPDATE documents SET current_version_id=NULL WHERE id=2; UPDATE documents SET current_version_id=21 WHERE id=3; SET CONSTRAINTS ALL IMMEDIATE$$,ARRAY['23503','23514']);
SELECT pg_temp.expect_error('current_version_must_be_approved', $$UPDATE documents SET current_version_id=31 WHERE id=3; SET CONSTRAINTS ALL IMMEDIATE$$,ARRAY['23514']);
SELECT pg_temp.expect_error('approved_snapshot_immutable', $$UPDATE document_versions SET title='Tampered' WHERE id=11$$,ARRAY['23514']);
SELECT pg_temp.expect_error('approved_courses_immutable', $$DELETE FROM version_courses WHERE version_id=11$$,ARRAY['23514']);
SELECT pg_temp.expect_error('file_identity_immutable', $$UPDATE files SET object_key='overwritten' WHERE id=1$$,ARRAY['23514']);
SELECT pg_temp.expect_error('safe_page_count_immutable', $$UPDATE files SET page_count=100 WHERE id=1$$,ARRAY['23514']);
SELECT pg_temp.expect_error('one_saved_item', $$INSERT INTO saved_documents(user_id,document_id) VALUES(3,1)$$,ARRAY['23505']);
SELECT pg_temp.expect_error('one_progress_per_version', $$INSERT INTO reading_progress(user_id,version_id,page_number) VALUES(3,11,3)$$,ARRAY['23505']);
SELECT pg_temp.expect_error('orphan_annotation_owner', $$INSERT INTO annotations(user_id,version_id,page_number,kind,content) VALUES(999,11,1,'PAGE_NOTE','x')$$,ARRAY['23503']);
SELECT pg_temp.expect_error('positive_annotation_page', $$INSERT INTO annotations(user_id,version_id,page_number,kind,content) VALUES(3,11,0,'PAGE_NOTE','x')$$,ARRAY['23514']);
SELECT pg_temp.expect_error('highlight_requires_anchor', $$INSERT INTO annotations(user_id,version_id,page_number,kind) VALUES(3,11,1,'TEXT_HIGHLIGHT')$$,ARRAY['23514']);
SELECT pg_temp.expect_error('report_exactly_one_target', $$INSERT INTO reports(reported_by,document_id,book_id,category,description) VALUES(3,1,1,'OTHER','x')$$,ARRAY['23514']);
SELECT pg_temp.expect_error('report_target_required', $$INSERT INTO reports(reported_by,category,description) VALUES(3,'OTHER','x')$$,ARRAY['23514']);
SELECT pg_temp.expect_error('report_version_belongs_to_document', $$INSERT INTO reports(reported_by,document_id,version_id,category,description) VALUES(3,1,21,'OTHER','x')$$,ARRAY['23503']);
SELECT pg_temp.expect_error('safe_requires_parse_result', $$UPDATE files SET scan_status='SAFE' WHERE id=4$$,ARRAY['23514']);
SELECT pg_temp.expect_error('reset_expiry_after_creation', $$INSERT INTO password_reset_tokens(user_id,token_hash,expires_at) VALUES(3,'fixture-hash',now()-interval '1 hour')$$,ARRAY['23514']);
SELECT pg_temp.expect_error('kind_not_convertible_by_transfer', $$UPDATE documents SET kind='LECTURER_MATERIAL' WHERE id=2$$,ARRAY['23514']);

INSERT INTO document_versions(id,document_id,version_no,file_id,created_by,title,authors,material_type,source_reference,rights_basis) OVERRIDING SYSTEM VALUE
 VALUES(12,1,2,5,2,'New PDF','Original author','TEXTBOOK','Self-created fixture','Test-only content');
INSERT INTO version_courses VALUES(12,1);
SELECT pg_temp.expect_error('one_working_version', $$INSERT INTO document_versions(document_id,version_no,file_id,created_by,title,material_type,source_reference,rights_basis) VALUES(1,3,5,2,'Extra draft','TEXTBOOK','Fixture','Fixture')$$,ARRAY['23505']);
UPDATE document_versions SET review_status='SUBMITTED',revision=2 WHERE id=12;
INSERT INTO publication_requests(id,version_id,submitted_by,submitted_revision) OVERRIDING SYSTEM VALUE VALUES(2,12,2,2);
SELECT pg_temp.expect_error('one_pending_request', $$INSERT INTO publication_requests(version_id,submitted_by,submitted_revision) VALUES(12,2,2)$$,ARRAY['23505']);
SELECT pg_temp.expect_error('submitted_snapshot_frozen', $$UPDATE document_versions SET title='Changed in review' WHERE id=12$$,ARRAY['23514']);
SELECT pg_temp.expect_error('submitted_courses_frozen', $$INSERT INTO version_courses(version_id,course_id) VALUES(12,2)$$,ARRAY['23514']);
SELECT pg_temp.assert_true('new_pdf_keeps_old_note_anchor',(SELECT version_id=11 AND user_id=3 FROM annotations WHERE id=1));

-- Simulate the atomic data writes of BR17, not the unimplemented authorization API.
UPDATE publication_requests SET status='WITHDRAWN',resolved_by=1,resolved_at=now(),reason='Manager handover',revision=revision+1 WHERE id=2;
UPDATE document_versions SET review_status='DRAFT',revision=revision+1 WHERE id=12;
UPDATE documents SET manager_id=4,revision=revision+1 WHERE id=1;
INSERT INTO ownership_transfers(document_id,from_user_id,to_user_id,performed_by,reason) VALUES(1,2,4,1,'Manager handover');
SELECT pg_temp.assert_true('transfer_preserves_published_version',(SELECT manager_id=4 AND current_version_id=11 AND created_by=2 FROM documents WHERE id=1));
SELECT pg_temp.assert_true('transfer_withdraws_pending_attempt',(SELECT status='WITHDRAWN' AND submitted_by=2 FROM publication_requests WHERE id=2));
SELECT pg_temp.assert_true('transfer_draft_keeps_original_creator',(SELECT review_status='DRAFT' AND created_by=2 FROM document_versions WHERE id=12));
SELECT pg_temp.assert_true('transfer_keeps_private_owners',(SELECT count(*)=2 FROM annotations WHERE version_id=11 AND user_id IN(3,5)));
DELETE FROM saved_documents WHERE user_id=3 AND document_id=1;
SELECT pg_temp.assert_true('unsave_keeps_notes_and_progress',(SELECT count(*)=2 FROM annotations WHERE version_id=11) AND EXISTS(SELECT 1 FROM reading_progress WHERE user_id=3 AND version_id=11));

UPDATE document_versions SET review_status='SUBMITTED',revision=revision+1 WHERE id=12;
INSERT INTO publication_requests(version_id,submitted_by,submitted_revision) VALUES(12,4,4);
SELECT pg_temp.assert_true('resubmission_keeps_previous_attempt',(SELECT count(*)=2 FROM publication_requests WHERE version_id=12));
UPDATE documents SET visibility='HIDDEN' WHERE id=1;
INSERT INTO visibility_events(document_id,performed_by,from_visibility,to_visibility,reason) VALUES(1,1,'VISIBLE','HIDDEN','Test hide');
SELECT pg_temp.assert_true('hide_does_not_delete_notes',(SELECT count(*)=2 FROM annotations WHERE version_id=11));
INSERT INTO reports(id,reported_by,document_id,version_id,category,description) OVERRIDING SYSTEM VALUE VALUES(1,3,1,11,'FILE_ERROR','Fixture error');
INSERT INTO reports(reported_by,book_id,category,description) VALUES(3,1,'BROKEN_LINK','Fixture broken link');
INSERT INTO report_actions(report_id,performed_by,action,result) VALUES(1,1,'TAKE_REVIEW','Reviewing fixture');
SELECT pg_temp.assert_true('report_and_book_metadata_without_pdf',EXISTS(SELECT 1 FROM books WHERE id=1 AND native_document_id IS NULL) AND EXISTS(SELECT 1 FROM report_actions WHERE report_id=1));
SET CONSTRAINTS ALL IMMEDIATE;
SELECT json_build_object('passed',count(*),'checks',json_agg(name ORDER BY name)) FROM design_checks;
ROLLBACK;
