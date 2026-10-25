-- 저장 공간 정리·백업 복원용 — Supabase SQL Editor에서 한 번 실행하세요.
-- 1) 로그인한 사용자가 exams 저장소의 파일을 지울 수 있게 (임시 업로드 파일 자동 정리, '저장 공간 정리' 화면에서 사용)
drop policy if exists "exams_auth_delete" on storage.objects;
create policy "exams_auth_delete" on storage.objects for delete to authenticated using (bucket_id = 'exams');

-- 2) 해설 없는 XML·해설 XML 칸은 이제 비워 둠 (출력할 때 해설 포함본에서 만듦)
alter table problems alter column problem_xml set default '';
