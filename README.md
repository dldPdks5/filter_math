# 문항 창고 — 모의고사 문항 분리·분류·출력

HWPX 모의고사를 올리면 문항을 하나씩 나누고(정답·해설·그림 포함), 체계표 기준으로 개념 태그를 붙여
나중에 필터로 모아 HWPX/PDF 학습지로 출력하는 웹앱입니다.

## 지금 되는 것 (3단계까지)
- HWPX 업로드 → 문항 자동 분리 (문단 스타일 '문제' 기준, 해설은 미주에서)
- 회차별 태깅 화면: 주 단원 지정, 개념 태그 클릭, 새 개념 추가, 태그 확정, 태그 초안 JSON 일괄 적용
- 로컬 테스트 모드(Supabase 설정이 없을 때 `.data/` 폴더에 저장) / Supabase 모드(로그인 필요)

## 회차 삭제·문제 수정
- **회차 삭제** (회차 목록의 '삭제', 태그 화면 왼쪽 아래 '이 회차 삭제'): 회차 이름을 입력해야 지워지는 영구 삭제.
  회차·문항·태그 연결(DB cascade)과 Storage의 양식 파일·그림을 함께 지움. 저장 학습지는 고치지 않고,
  열 때 없는 문항만 빼고 "삭제된 문항 n개"를 알려 줌 (학습지 목록·문제 찾기·인쇄 화면).
- **문제 수정** (태그 화면 '문제 수정'): 저장하면 원본(DB의 문항 XML)을 바로 덮어씀. 되돌리기 없음.
  - 번호·정답 수정 (겹치는 번호는 확인 후 맞바꿈)
  - 문제·해설의 글자 조각(`<hp:t>`)과 수식(`<hp:script>`) 수정 → 화면용 블록은 고친 XML에서 다시 만듦.
    고친 문단은 `<hp:linesegarray>`를 지워 한글이 줄 배치를 다시 계산하게 함
  - 나누기: 고른 문단부터 다음 번호 새 문항 (뒤 번호 +1, 해설 미주는 그 미주가 있던 문단을 따라감)
  - 합치기: 다음 번호 문항을 뒤에 붙임 (해설 미주 하나로 합침, 태그 합침, 뒤 번호 -1)
  - 그림 추가·교체, 문단 추가, 글자모양 변경은 안 됨 → 한글에서 원본을 고쳐 다시 올리기
  - 코드: `src/hwpx/edit.ts`(XML 처리), `src/server/edit.ts`(저장 흐름), `src/app/exams/[id]/ProblemEditor.tsx`(화면)
- DB 구조 변경 없음 (추가로 실행할 SQL 없음)

## 로컬에서 실행
```bash
npm install
npm run dev        # http://localhost:3000
```
Supabase 환경변수가 없으면 자동으로 로컬 테스트 모드로 동작합니다.

## Supabase 연결
1. supabase.com에서 프로젝트 생성
2. SQL Editor에서 `supabase/schema.sql` 실행 → 이어서 `supabase/seed.sql` 실행
3. Authentication → Users → Add user 로 본인 계정 생성
4. Authentication → Sign In / Providers 에서 **Allow new users to sign up 끄기** (본인 계정만 로그인 가능)
5. `.env.local` 파일 생성:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
   ```
   (service_role 키는 쓰지 않습니다. 어디에도 올리지 마세요.)

## Vercel 배포
1. 이 폴더를 GitHub 저장소로 올림
2. Vercel → Add New Project → 저장소 선택
3. Environment Variables에 위 두 값 입력 → Deploy

## 체계표 수정
- 앱 안에서: 태깅 화면의 각 중단원 끝 '+ 개념 추가'
- 파일로: `data/taxonomy.json` 수정 → `npm run seed-sql` → 새 `supabase/seed.sql`을 SQL Editor에서 실행
  (이미 있는 항목은 건너뛰므로 여러 번 실행해도 안전)

## 태그 초안 JSON 형식
```json
{ "problems": [ { "number": 8, "mainUnit": "TRIG", "tags": ["TRIG|사인·코사인법칙|코사인법칙"] } ] }
```
태그는 `단원키|중단원 이름|개념 이름`. 체계표에 없는 항목은 적용하지 않고 목록으로 알려 줍니다.

## 폴더 구조
- `src/hwpx/` HWPX 분리(parse)·합치기(compose)
- `src/eq/` 한글 수식 → LaTeX
- `src/render/` 문항 HTML 렌더 (미리보기·PDF 공용)
- `src/repo/` 저장소 (local / supabase)
- `src/app/` 화면과 API
- `supabase/` DB 스키마와 체계표 seed
- `scripts/` 테스트·생성 스크립트

## 다음 단계(4단계) 예정
필터 화면(교육과정 연결/따로 보기, OR/AND), 문제 담기, HWPX/PDF 출력, 여러 회차 문항 합치기(스타일 번호 재매핑)
