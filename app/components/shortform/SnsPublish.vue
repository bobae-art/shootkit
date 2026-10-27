<script setup lang="ts">
// 내 SNS 계정에 올리기(2026-10-22 「인스타 · 틱톡 · 페이스북 · 쇼츠 본인 계정에 등록하는 기능」).
// ① 앱으로 올리기 = 실제 동작(캡컷식 아이콘 줄): 웹은 휴대폰 공유창(Web Share), 앱은 각 플랫폼 공유 SDK로 그 앱 게시 화면을 연다.
// ② 연결한 계정에 바로 올리기 = 시안: 계정 연결(로그인 권한 허락)과 자동 게시는 서버 단계라 화면 흐름만 보여 주고 실제로 올리지 않는다.
import { computed, ref, shallowRef, watch } from "vue";
import { PLATFORMS, STEP_LABEL, iconOf, type PlatformId, type PlatformState, type SnsStatus } from "~/lib/shortform/sns";
import type { MadeShortform } from "~/lib/shortform/types";

/** compact: 촬영 앱 쇼츠용(2026-10-25 컨설팅) — 앱으로 올리기를 먼저, 계정 직접 연결은 「고급」으로 접는다. 딜러 숏폼 제작기는 그대로. */
const props = withDefaults(defineProps<{ made: MadeShortform; storageKey: string; initialHandles: Partial<Record<PlatformId, string>>; caption: string; onToast: (message: string) => void; compact?: boolean }>(), { compact: false });

const accounts = shallowRef<Partial<Record<PlatformId, PlatformState>>>(
  (() => {
    try {
      return JSON.parse(window.localStorage.getItem(props.storageKey) ?? "{}");
    } catch {
      return {};
    }
  })(),
);
const editing = ref<PlatformId | null>(null);
const draft = ref("");
const caption = ref(props.caption);
const status = shallowRef<Partial<Record<PlatformId, SnsStatus>>>({});
const running = ref(false);

watch([accounts, () => props.storageKey], ([value, key]) => {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* 이번 화면에서만 기억 */
  }
});

const connected = computed(() => PLATFORMS.filter((item) => accounts.value[item.id]?.handle));
const targets = computed(() => connected.value.filter((item) => accounts.value[item.id]?.on));
const fileName = computed(() => `bobae-shortform-${props.made.carId}.mp4`);
const APP_ORDER: PlatformId[] = ["instagram", "tiktok", "youtube", "facebook"];
const platformOf = (id: PlatformId) => PLATFORMS.find((platform) => platform.id === id)!;

const copyCaption = async () => {
  try {
    await navigator.clipboard.writeText(caption.value);
    props.onToast("글을 복사했어요");
  } catch {
    props.onToast("복사하지 못했어요. 글을 길게 눌러 복사해 주세요");
  }
};

// ① 캡컷처럼 앱 아이콘을 눌러 올리기(2026-10-22 「캡컷처럼 우리가 직접 업로드 가능하게」).
// 웹: 휴대폰 공유창(Web Share)에 영상+글을 넘기고 딜러가 그 앱을 고른다. 공유창이 없는 PC는 내려받기+글 복사.
// 보배드림 앱(Flutter): 같은 버튼이 인스타그램·페이스북 「Sharing to Reels」, 틱톡 「Share Kit」로 그 앱의 게시 화면을 바로 연다.
const shareToApp = async (target?: PlatformId) => {
  const name = PLATFORMS.find((item) => item.id === target)?.name;
  try {
    await navigator.clipboard.writeText(caption.value);
  } catch {
    /* 복사 버튼으로 다시 */
  }
  try {
    const blob = await (await fetch(props.made.url)).blob();
    const file = new File([blob], fileName.value, { type: "video/mp4" });
    const data: ShareData = { files: [file], text: caption.value, title: props.made.title };
    if (navigator.canShare?.(data)) {
      await navigator.share(data);
      if (name) props.onToast(`${name}에 올리면 글은 붙여넣기만 하면 돼요(복사해 두었어요)`);
      return;
    }
  } catch (error) {
    if ((error as Error).name === "AbortError") return;
  }
  const link = document.createElement("a");
  link.href = props.made.url;
  link.download = fileName.value;
  link.click();
  props.onToast(name ? `영상을 내려받고 글을 복사했어요. ${name} 앱에서 올려 주세요` : "영상을 내려받고 글을 복사했어요. 각 앱에서 올려 주세요");
};

// ② 시안: 연결한 계정마다 올리기 → 처리 → 게시 순서를 보여 준다(실제 전송 없음).
const publishAll = async () => {
  if (!targets.value.length || running.value) return;
  running.value = true;
  for (const item of targets.value) {
    for (const step of ["upload", "process", "done"] as SnsStatus[]) {
      status.value = { ...status.value, [item.id]: step };
      await new Promise((resolve) => window.setTimeout(resolve, step === "done" ? 200 : 700));
    }
  }
  running.value = false;
  props.onToast(`${targets.value.map((item) => item.name).join(" · ")} 게시 흐름을 확인했어요(시안이라 실제로 올라가지 않아요)`);
};

const startEdit = (id: PlatformId) => {
  editing.value = id;
  draft.value = props.initialHandles[id] ?? "";
};
const setOn = (id: PlatformId, handle: string, on: boolean) => {
  accounts.value = { ...accounts.value, [id]: { handle, on } };
};
const connect = (id: PlatformId) => {
  accounts.value = { ...accounts.value, [id]: { handle: draft.value.trim(), on: true } };
  editing.value = null;
};
const disconnect = (id: PlatformId) => {
  const next = { ...accounts.value };
  delete next[id];
  accounts.value = next;
};
</script>

<template>
  <section class="sfp" aria-labelledby="sfp-title">
    <h3 id="sfp-title">{{ compact ? "공유하기" : "내 SNS 계정에 올리기" }}</h3>

    <div class="sfp-caption">
      <label for="sfp-caption-text">함께 올릴 글</label>
      <textarea id="sfp-caption-text" :value="caption" rows="5" @input="caption = ($event.target as HTMLTextAreaElement).value" />
      <button type="button" @click="copyCaption">글 복사</button>
    </div>

    <div class="sfp-block">
      <b>앱으로 올리기</b>
      <p>아이콘을 누르면 그 앱의 게시 화면으로 영상이 넘어가요. 글은 자동으로 복사돼요.</p>
      <div class="sfp-apps" role="group" aria-label="앱으로 올리기">
        <button v-for="id in APP_ORDER" :key="id" type="button" :aria-label="`${platformOf(id).name}에 올리기`" @click="shareToApp(id)">
          <img :src="iconOf(id)" alt="" aria-hidden="true" /><span>{{ platformOf(id).name }}</span>
        </button>
        <button type="button" aria-label="다른 앱으로 공유" @click="shareToApp()"><i aria-hidden="true">···</i><span>기타</span></button>
      </div>
      <p class="sfp-hint">보배드림 앱에서는 버튼 하나로 인스타그램 릴스 · 틱톡 · 페이스북 릴스 편집 화면이 바로 열려요(캡컷과 같은 방식). 웹에서는 공유창에서 앱을 골라 주세요.</p>
    </div>

    <details v-if="compact" class="sfp-more">
      <summary>SNS 계정 직접 연결 · 고급</summary>
      <div class="sfp-block">
        <b>연결한 계정에 바로 올리기 <em>시안</em></b>
        <p>한 번 연결하면 버튼 하나로 여러 계정에 동시에 올려요. 실제 연결·게시는 서버 단계에서 열려요.</p>
        <ul class="sfp-list">
          <li v-for="item in PLATFORMS" :key="item.id">
            <img :src="iconOf(item.id)" alt="" aria-hidden="true" />
            <span class="sfp-name">
              <b>{{ item.name }} {{ item.where }}</b>
              <small>{{ accounts[item.id]?.handle ? `연결됨 · ${accounts[item.id]!.handle}` : item.rule }}</small>
              <small v-if="(status[item.id] ?? 'idle') !== 'idle'" :class="`sfp-step is-${status[item.id]}`">{{ STEP_LABEL[status[item.id]!] }}</small>
            </span>
            <label v-if="accounts[item.id]?.handle" class="sfp-toggle"><input type="checkbox" :checked="accounts[item.id]!.on" :disabled="running" @change="setOn(item.id, accounts[item.id]!.handle, ($event.target as HTMLInputElement).checked)" /><span>올리기</span></label>
            <button v-else type="button" class="sfp-connect" @click="startEdit(item.id)">연결하기</button>
            <div v-if="editing === item.id" class="sfp-connect-form">
              <p>실제 서비스에서는 {{ item.name }} 로그인 창이 열리고, 보배드림이 영상을 올리도록 허락하는 단계를 거쳐요. 시안에서는 계정 이름만 기억해요.</p>
              <div>
                <input :value="draft" :placeholder="item.placeholder" :aria-label="item.placeholder" @input="draft = ($event.target as HTMLInputElement).value" />
                <button type="button" :disabled="!draft.trim()" @click="connect(item.id)">연결</button>
                <button type="button" class="is-text" @click="editing = null">취소</button>
              </div>
            </div>
            <button v-if="accounts[item.id]?.handle && editing !== item.id" type="button" class="sfp-disconnect" :aria-label="`${item.name} 연결 해제`" @click="disconnect(item.id)">해제</button>
          </li>
        </ul>
        <button type="button" class="sfp-primary" :disabled="!targets.length || running" @click="publishAll">{{ running ? "올리는 중…" : targets.length ? `${targets.length}개 계정에 올리기` : "계정을 연결해 주세요" }}</button>
      </div>
    </details>
    <div v-else class="sfp-block">
      <b>연결한 계정에 바로 올리기 <em>시안</em></b>
      <p>한 번 연결하면 버튼 하나로 여러 계정에 동시에 올려요. 실제 연결·게시는 서버 단계에서 열려요.</p>
      <ul class="sfp-list">
        <li v-for="item in PLATFORMS" :key="item.id">
          <img :src="iconOf(item.id)" alt="" aria-hidden="true" />
          <span class="sfp-name">
            <b>{{ item.name }} {{ item.where }}</b>
            <small>{{ accounts[item.id]?.handle ? `연결됨 · ${accounts[item.id]!.handle}` : item.rule }}</small>
            <small v-if="(status[item.id] ?? 'idle') !== 'idle'" :class="`sfp-step is-${status[item.id]}`">{{ STEP_LABEL[status[item.id]!] }}</small>
          </span>
          <label v-if="accounts[item.id]?.handle" class="sfp-toggle"><input type="checkbox" :checked="accounts[item.id]!.on" :disabled="running" @change="setOn(item.id, accounts[item.id]!.handle, ($event.target as HTMLInputElement).checked)" /><span>올리기</span></label>
          <button v-else type="button" class="sfp-connect" @click="startEdit(item.id)">연결하기</button>
          <div v-if="editing === item.id" class="sfp-connect-form">
            <p>실제 서비스에서는 {{ item.name }} 로그인 창이 열리고, 보배드림이 영상을 올리도록 허락하는 단계를 거쳐요. 시안에서는 계정 이름만 기억해요.</p>
            <div>
              <input :value="draft" :placeholder="item.placeholder" :aria-label="item.placeholder" @input="draft = ($event.target as HTMLInputElement).value" />
              <button type="button" :disabled="!draft.trim()" @click="connect(item.id)">연결</button>
              <button type="button" class="is-text" @click="editing = null">취소</button>
            </div>
          </div>
          <button v-if="accounts[item.id]?.handle && editing !== item.id" type="button" class="sfp-disconnect" :aria-label="`${item.name} 연결 해제`" @click="disconnect(item.id)">해제</button>
        </li>
      </ul>
      <button type="button" class="sfp-primary" :disabled="!targets.length || running" @click="publishAll">{{ running ? "올리는 중…" : targets.length ? `${targets.length}개 계정에 올리기` : "계정을 연결해 주세요" }}</button>
    </div>
  </section>
</template>
