# Shootkit

보배드림 촬영 쇼츠 키트를 독립 저장소로 분리한 프로젝트입니다. 사진·영상 촬영, 부위별 사진 정리, 편집, 쇼츠 제작 화면을 제공합니다.

배포 주소: https://bobae-art.github.io/shootkit/

기존 `?register=shootkit` 쿼리를 붙여도 같은 키트가 열립니다.

## 원본

- 저장소: https://github.com/bobaekimboae/bobaedream
- 원본 커밋: [`563c3a11efb62be739d22efdcff6dd92876ee4c9`](https://github.com/bobaekimboae/bobaedream/commit/563c3a11efb62be739d22efdcff6dd92876ee4c9)
- 원본 화면: https://bobaekimboae.github.io/bobaedream/?register=shootkit&v=563c3a1
- 핵심 원본: `src/prototype/register/shoot-kit/`

슈트킷 소스와 필요한 공유 숏폼 코드, 데이터, 아이콘, 촬영 가이드, 로컬 글꼴을 복사했습니다. 독립 진입점과 빌드 설정을 추가했으며 공유 SNS 컴포넌트의 타입 참조만 별도 파일로 옮겼습니다. 원본 앱의 다른 화면과 서버는 포함하지 않습니다. 복사한 파일과 원본 Git blob SHA는 `docs/source-manifest.json`, 원본 에이전트 가이드는 `docs/UPSTREAM-AGENTS.md`에 기록되어 있습니다.

## 실행 및 빌드

Node.js 24 이상을 사용합니다.

```sh
npm ci --no-audit --no-fund
npm run dev
npm run build
npm run preview
```

개발·미리보기 주소의 `/shootkit/` 경로로 접속합니다. 배포 파일은 `dist/`에 생성됩니다. Vite의 `base`를 `/shootkit/`으로 설정해 GitHub Pages의 프로젝트 경로와 지연 로딩 경로를 함께 처리합니다.

## GitHub Pages 배포

`main`에는 소스를 저장하고 `gh-pages` 브랜치 루트에는 `dist/`의 파일을 저장합니다. GitHub 저장소의 **Settings → Pages → Build and deployment**에서 **Deploy from a branch**, **gh-pages**, **/(root)**를 선택합니다.

새 버전은 `npm ci && npm run build` 후 생성된 `dist/`를 `gh-pages` 브랜치에 반영하면 배포됩니다. `.nojekyll`도 함께 배포합니다.

## 동작

- 카메라·마이크는 HTTPS 또는 localhost에서 사용 권한이 필요합니다.
- MP4 생성에는 브라우저의 WebCodecs 지원을 사용합니다. 기기 공유 또는 파일 내려받기는 원본 기능을 유지합니다.
- 사진 자동 분류를 처음 사용하면 Hugging Face의 CLIP 모델과 실행 파일을 내려받습니다. 사진 분류는 브라우저에서 처리합니다.
- 등록하기와 SNS 연결 계정 직접 게시는 원본의 시안 동작을 유지합니다.

## 저작권 및 제삼자 자료

원본의 저작권과 에셋 출처를 유지합니다. 원본 저장소 루트에는 별도 LICENSE 파일이 없으므로 이 분리본에 새로운 라이선스를 부여하지 않았습니다. Pretendard 글꼴의 SIL Open Font License 원문은 `public/assets/fonts/pretendard/OFL.txt`에 보존했습니다. npm 의존성은 각 패키지의 라이선스를 따릅니다.
