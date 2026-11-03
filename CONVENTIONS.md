# 리액트 → 넉스트(Vue) 옮기기 규칙

원본: `src/prototype/register/shoot-kit/` (리액트, `?register=shootkit`). 대상: `nuxt-shootkit/` (Nuxt 3.21 · Vue 3.5, `ssr: false`).

## 가장 중요한 것: 화면이 한 글자도 달라지면 안 된다
- 기존 자동 시험(Playwright)이 **클래스 이름 · aria 속성 · 버튼 글자 · role**로 화면을 찾는다. 원본 JSX가 그리는 DOM과 **같은 태그 · 같은 class · 같은 aria-* · 같은 role · 같은 글자 · 같은 순서**를 그대로 그린다.
- `className` → `class`, `htmlFor` → `for`, `tabIndex` → `tabindex`, `readOnly` → `readonly`, `playsInline` → `playsinline`, `autoPlay` → `autoplay`, `strokeWidth` → `stroke-width` 등 SVG 속성은 kebab-case.
- `style={{ ... }}` → `:style="{ ... }"`. CSS 변수(`"--x": v`)도 같은 객체로.
- 조건부 `null`은 `v-if`로, 배열 `map`은 `v-for`(같은 `:key`)로.
- 원본의 한국어 주석(날짜 · 지시 근거)은 지우지 말고 옮긴다.

## 컴포넌트 · 이벤트
- 한 컴포넌트 = `components/shoot/<이름>.vue`, `<script setup lang="ts">` + `<template>`. 스타일은 넣지 않는다(이미 `assets/css/*.css`가 전역으로 들어감).
- props: 원본 이름 그대로(`existing`, `startMode` …). 단 콜백 prop은 emit으로 바꾼다.
  - 규칙: `onFooBar(x, y)` → `emit("fooBar", x, y)`. 부모에서는 `@foo-bar="..."`.
  - 콜백이 **값을 돌려줘야** 하면(드묾) emit 대신 함수 prop으로 두고 파일 맨 위 주석에 적는다.
  - 선택 콜백(`onCourse?:` 처럼 있을 때만 버튼이 보이는 것)은 `show<Name>?: boolean` prop + emit으로. 예: CamPermission의 `showCourse`.
- `children` → 기본 slot. 
- `ref`로 자식 DOM에 접근하던 것은 `ref<HTMLElement | null>(null)` + 템플릿 `ref="이름"`.

## 상태 · 효과
- `useState` → `ref`(객체·배열·큰 데이터·MediaStream·Blob은 `shallowRef`도 가능. 단 깊은 변경을 감지해야 하면 `ref`).
  - 원본이 `setX(prev => ...)`로 새 배열·객체를 만들어 넣는 곳은 그대로 새 값을 대입한다(`x.value = [...]`). 제자리 변경(`push`)으로 바꾸지 않는다.
- `useRef`(DOM 아님, 값 보관) → 그냥 `let` 변수 또는 `{ current }` 객체. 화면에 안 그려지는 값은 반응형으로 만들지 않는다.
- `useEffect(fn, [a, b])` → `watch([() => a, () => b], fn, { immediate: true })` + `onBeforeUnmount`에서 정리. 빈 배열 `[]`이면 `onMounted` + `onBeforeUnmount`. 정리 함수가 있으면 watch의 `onCleanup` 또는 따로 보관해서 부른다. DOM이 필요하면 `flush: "post"`.
- `useMemo` → `computed`. `useLayoutEffect` → `watch(..., { flush: "post" })` 또는 `onMounted`.
- 리액트의 "최신 콜백 보관용 ref"(`closeRef.current = onClose`)는 Vue에서는 필요 없다(emit은 늘 최신).
- 타이머(`setTimeout` · `setInterval` · `requestAnimationFrame`)는 반드시 `onBeforeUnmount`에서 지운다.

## 이미 옮겨 둔 것(그대로 import 해서 쓴다. 고치지 말 것)
- `lib/core.ts`: STAGE_DEFS · DEFAULT_DEFS · PREFS(+`setPrefs`) · applyPrefs · def · INTERIOR_STEPS · STEP_SEC · HARD_MAX · BASE_STAGES · EXTRA_STAGES · STAGES · PLUS · PHOTO_SLOTS · ENFORCE · ENF_TEXT · ALLOW_FAKE · reqLabel · MAX_EXTRA · STAGE_DO · stageDo · CourseKey · COURSES · withDamage · courseOf · courseLabel · Mark · Photo · PLATE_KINDS · platePlace · slotOrder · sortBySlot · Video · Take · uid · msec · mmss · isStandalone · permHelp · readDuration · plainCover · releaseVideo · OTHER · MAX_PHOTOS
  - 리액트에서 `PREFS = prefs` 하던 곳은 `setPrefs(prefs)`.
- `lib/site.ts`: `rd(name)`(레딧 아이콘 주소) · `icon(dir, name)` · `sitePath(...)` · `SITE_BASE` · `query()`. 원본의 `base`/`icon`/`rd`는 이것으로.
- `lib/stages.ts`: VideoStage 형식 · stageGuide · stageThumb · setCustomGuide · tpl · RULE_FILE · RULE_PLATES (원본 templates.tsx 의 데이터)
- `lib/items.ts` · `lib/image-ops.ts` · `lib/sound.ts` · `lib/save-mp4.ts` · `lib/shorts.ts` · `lib/stage-prefs.ts` · `lib/autosort.ts` · `lib/render.ts`(원본 dealer-page/shortform/render.ts) · `lib/camera.ts`(grabFrame · extractFrames · pickRecorderType · fakeStream) · `lib/dialog-stack.ts`
- `data/shoot-items-kit.json` · `data/regions-kr.json`
- composables: `useCamera(() => active, () => withAudio)` → `{ stream, error, torchSupported, retry, setTorch }`(stream · error · torchSupported는 Ref) · `useLayerEsc(elRef, onClose, () => enabled)` · `useDialogFocus(elRef, onClose)` · `useSwipe(onLeft, onRight)`(템플릿에 `v-on="swipe"`, 이벤트 이름 pointerdown/pointerup) · `useBox<T>()` → `{ el, box }` · `useFit(() => src, boxRef)` → computed `{ w, h, nat }`
- components/shoot: `Mask`(props `src`, `cls`) · `Toast`(`text`) · `FocusBox`(@close, 나머지 속성은 div에 붙음) · `Confirm`(props `text` `cancelText` `okText` `hasDim`, emits `cancel` `ok` `dim`) · `Corners` · `ModeTabs`(`mode` `hideAlbum` `labels`, emit `change`) · `LiveVideo`(`stream`, `defineExpose({ el })` = video 요소 ref) · `FlashToggle`(`on`, emit `toggle`) · `PhotoCounter`(`required` `total`) · `NoCam`(`denied`) · `CamPermission`(`kind` `what` `showCourse`, emits `retry` `album` `course` `close`) · `StageTemplate`(`stage` `large`) · `RuleIllustration`(`angle` `flip` `plates`) · `ShotGuide`(`slot`)
  - 원본 `<Mask src={x} className="y" />` → `<Mask :src="x" cls="y" />`
  - 원본 `<Confirm onDim={f} …/>` → `<Confirm has-dim @dim="f" …/>`

## 형식 검사
`cd nuxt-shootkit && npx nuxi prepare && npx vue-tsc --noEmit -p tsconfig.json` — 내가 만든 파일의 오류가 0이어야 한다(아직 없는 다른 컴포넌트를 import 해서 생기는 오류는 무시).
