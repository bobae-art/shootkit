# 보배드림 촬영 쇼츠 키트 — 넉스트(Nuxt 3) 판

리액트 시안 `?register=shootkit`(`src/prototype/register/shoot-kit/`)을 보배드림 프런트엔드와 같은 **Nuxt 3 + Vue 3**로 옮긴 것이다. 화면 · 글자 · 동작은 리액트 판과 같고, 같은 자동 시험을 그대로 통과하는 것을 기준으로 옮겼다.

- **이 저장소(bobae-art/shootkit) 확인 주소: https://bobae-art.github.io/shootkit/** — `main`에 올리면 GitHub Actions(`.github/workflows/deploy.yml`)가 빌드해서 `gh-pages` 브랜치로 배포한다(몇 분 걸림).
- 원본(복사해 온 곳): https://bobaekimboae.github.io/bobaedream/nuxt-shootkit/ — 이 저장소를 고쳐도 원본은 바뀌지 않는다.
- 리액트 판(비교용, 2026-10-29부터 더 고치지 않음): https://bobaekimboae.github.io/bobaedream/?register=shootkit
- **2026-10-29 「넉스트 하나만 가자」: 촬영 쇼츠 키트는 이 폴더만 고친다.** 리액트 판과 같게 맞추던 규칙은 끝났다. 새 기능·수정은 여기에만 넣는다.
- 주소 검색어는 리액트 판과 같다: `?vstage=58`(58 원본 재현) · `?fakecam=1`(카메라 없는 PC 시험) · `?debug=1` · `?guide=on`(사진 윤곽선 시안)
- 「등록하기」 실제 업로드는 서버 주소(`lib/upload.ts`의 `DEFAULT_API`)가 비어 있어 아직 꺼져 있다(안내만).

## 버전
Nuxt 3.21.11 · Vue 3.5.43 · TypeScript 5.9 · `ssr: false`(카메라 · 녹화 · 캔버스를 쓰는 화면이라 브라우저에서만 그림) · 라우터 없음(한 화면 앱, `app.vue` → `ShootRegister.vue`).

## 폴더
| 폴더 | 내용 |
|---|---|
| `components/shoot/` | 화면 컴포넌트. `ShootRegister.vue`가 등록 화면이자 화면 전환(사진 촬영 · 편집 · 영상 촬영 · 미리보기 · 표지 · 쇼츠 · 규칙 · 지역) 담당 |
| `composables/` | `useCamera` · `useLayerEsc` · `useDialogFocus` · `useSwipe` · `useBox` · `useFit` · `useDragSwap` |
| `lib/` | 화면과 상관없는 로직(리액트 판에서 그대로 옮김): 촬영 항목 · 사진 처리 · mp4 저장 · 쇼츠 구간 고르기 · 그리기(`render.ts`) · 부위 자동 나누기(`autosort.ts`) · 공통 값(`core.ts`) |
| `data/` | `shoot-items-kit.json`(촬영 항목 단일 기준) · `regions-kr.json` |
| `assets/css/` | 리액트 판 CSS 그대로(`shoot.css` · `shorts.css` · `shortform-studio.css`) + 기본 바탕 `base.css` |

아이콘 · 예시 사진 · 인식 데이터 · 글꼴은 이 저장소 `public/`에 함께 두고 앱 주소 바로 아래에서 읽는다(`lib/site.ts`의 `sitePath()`, 2026-11-04 원본 시안 사이트에서 복사). 실서비스로 옮길 때는 `SITE_BASE`만 바꾸면 된다.
`app/` 폴더는 10/27 Nuxt 4 변환 시도에서 남은 옛 코드로, 지금 빌드에는 쓰이지 않는다.

## 실행
```
npm install
npm run build        # nuxt generate → .output/public
npx vue-tsc --noEmit # 형식 검사
```
배포: `main`에 올리면 자동(`.github/workflows/deploy.yml`). 손으로 다시 돌리려면 GitHub → Actions → 「빌드 · 배포」 → Run workflow.

## 리액트 → Vue 대응
옮긴 규칙은 `CONVENTIONS.md`. 리액트의 `onXxx` 콜백 prop은 `emit("xxx")`, `useState` → `ref`, `useEffect` → `watch`/`onMounted`, `useMemo` → `computed`.
