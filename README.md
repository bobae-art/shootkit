# Shootkit

보배드림 촬영 쇼츠 키트를 독립 저장소로 분리한 프로젝트입니다. 사진·영상 촬영, 부위별 사진 정리, 편집, 쇼츠 제작 화면을 제공합니다.

배포 주소: https://bobae-art.github.io/shootkit/

기존 `?register=shootkit` 쿼리를 붙여도 같은 키트가 열립니다.

## Nuxt 변환(2026-10-27)

React 19 + Vite로 만들었던 키트를 **Nuxt 4.6.3(Vue 3.5)** 으로 옮겼습니다. 화면 동작·문구·스타일(클래스 이름)은 원본과 같게 유지했고, 카메라·캔버스·WebCodecs만 쓰는 브라우저 앱이라 SSR 없이(`ssr: false`) 정적 SPA로 만듭니다.

- `app/components/shoot/` : 촬영 키트 화면 조각(.vue). 원본 `ShootRegister.tsx` 안의 내부 컴포넌트를 파일 하나에 하나씩 나눴습니다.
- `app/components/shortform/` : 공유 SNS 게시 조각(`SnsPublish.vue`).
- `app/composables/` : 카메라 스트림(`useCamera`), 창 포커스·Esc(`useDialogStack`), 사진 맞춤 크기(`useFit`), 끌어서 칸 바꾸기(`useDragSwap`), React `useEffect` 모양의 도우미(`useEffect`).
- `app/lib/shoot/`, `app/lib/shortform/` : 프레임워크와 무관한 순수 TypeScript(촬영 항목·이미지 처리·쇼츠 컷 계획·mp4 만들기·자동 선별·숏폼 그리기). 원본 파일을 그대로 가져왔고, 공용 상수·형은 `app/lib/shoot/shared.ts`에 모았습니다.
- `app/data/` : 촬영 항목·지역 JSON. `app/assets/css/` : 원본 CSS 그대로(전역으로 불러옴).
- `public/` : 아이콘 · 촬영 예시 사진 · Pretendard 글꼴 · 자동 선별 자료(원본과 같음).

원본 React 소스와 Git blob SHA는 `docs/source-manifest.json`, 원본 에이전트 가이드는 `docs/UPSTREAM-AGENTS.md`에 남아 있습니다(경로는 변환 전 기준).

## 실행 및 빌드

Node.js 22.22 이상(24 권장)을 사용합니다.

```sh
npm ci --no-audit --no-fund
npm run dev        # http://127.0.0.1:3000/shootkit/
npm run generate   # 정적 파일 → .output/public
npm run preview
npm run typecheck  # vue-tsc
```

개발·미리보기 주소의 `/shootkit/` 경로로 접속합니다. `nuxt.config.ts`의 `app.baseURL`을 `/shootkit/`으로 설정해 GitHub Pages의 프로젝트 경로와 지연 로딩 경로를 함께 처리합니다.

## GitHub Pages 배포

`main`에는 소스를 저장하고 `gh-pages` 브랜치 루트에는 `npm run generate`로 만든 `.output/public/`의 파일을 저장합니다. GitHub 저장소의 **Settings → Pages → Build and deployment**에서 **Deploy from a branch**, **gh-pages**, **/(root)**를 선택합니다.

새 버전은 `npm ci && npm run generate` 후 생성된 `.output/public/`을 `gh-pages` 브랜치에 반영하면 배포됩니다. `.nojekyll`은 `public/`에 들어 있어 함께 복사됩니다(`_nuxt/` 폴더가 Jekyll에 걸러지지 않게).

## 동작

- 카메라·마이크는 HTTPS 또는 localhost에서 사용 권한이 필요합니다.
- MP4 생성에는 브라우저의 WebCodecs 지원을 사용합니다. 기기 공유 또는 파일 내려받기는 원본 기능을 유지합니다.
- 사진 자동 분류를 처음 사용하면 Hugging Face의 CLIP 모델과 실행 파일을 내려받습니다. 사진 분류는 브라우저에서 처리합니다.
- 등록하기와 SNS 연결 계정 직접 게시는 원본의 시안 동작을 유지합니다.

## 저작권 및 제삼자 자료

원본의 저작권과 에셋 출처를 유지합니다. 원본 저장소 루트에는 별도 LICENSE 파일이 없으므로 이 분리본에 새로운 라이선스를 부여하지 않았습니다. Pretendard 글꼴의 SIL Open Font License 원문은 `public/assets/fonts/pretendard/OFL.txt`에 보존했습니다. npm 의존성은 각 패키지의 라이선스를 따릅니다.
