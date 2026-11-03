<!--
  차량 사진 촬영 규칙(리액트 ShootRegister.tsx RulesPage)
  props: 없음
  emits:
    back()   — 뒤로 · Esc
    add()    — 「차량 사진 추가」(사진 촬영으로)
-->
<script setup lang="ts">
import Mask from "./Mask.vue";
import FocusBox from "./FocusBox.vue";
import RuleIllustration from "./RuleIllustration.vue";
import { ENFORCE, ENF_TEXT, PLUS, reqLabel } from "../../lib/core";
import { GROUPS, REQUIRED_IDS, SHOOT, isRequiredItem, itemLevel, itemOf, levelLabel } from "../../lib/items";
import { rd } from "../../lib/site";

const emit = defineEmits<{ back: []; add: [] }>();
// 그룹·항목·필수 여부는 모두 shoot-items-kit.json. 사진 칸 레일과 같은 순서·같은 이름이다.
const restOf = (g: (typeof GROUPS)[number]) => g.items.filter((a) => !isRequiredItem(a.id));
</script>
<template>
  <FocusBox class="shoot-layer shoot-rules" role="dialog" aria-modal="true" aria-labelledby="shoot-rules-t" @close="emit('back')">
    <header class="shoot-page-top">
      <button type="button" class="shoot-icon-btn" aria-label="뒤로" @click="emit('back')"><Mask :src="rd('back-outline-24')" cls="is-back" /></button>
      <h2 id="shoot-rules-t">차량 사진 촬영 규칙</h2>
      <span class="shoot-icon-btn" />
    </header>
    <div class="shoot-rules__body">
      <section class="shoot-rules__notice">
        <strong>{{ ENFORCE ? ENF_TEXT.rulesTitle : SHOOT.rulesTitle }}</strong>
        <p>{{ ENFORCE ? ENF_TEXT.rulesNotice : SHOOT.rulesNotice }}</p>
        <small class="shoot-rules__vehicle">{{ SHOOT.vehicleNote }}</small>
      </section>
      <!-- 2026-10-25 컨설팅 6건: 필수 4장을 맨 위 한 줄로 모으고, 그룹에는 나머지(권장·선택)만 둔다 -->
      <section class="shoot-rules__group is-required">
        <h3>{{ ENFORCE ? ENF_TEXT.levelLabel : (SHOOT.photo.keyTitle ?? reqLabel()) }} {{ REQUIRED_IDS.length }}장<span class="shoot-rules__badge is-required">{{ reqLabel() }}</span></h3>
        <div class="shoot-rules__grid">
          <figure v-for="id in REQUIRED_IDS" :key="id">
            <RuleIllustration :angle="itemOf(id).rule" :flip="itemOf(id).ruleFlip" :plates="PLUS" />
            <figcaption>{{ itemOf(id).label }}</figcaption>
          </figure>
        </div>
      </section>
      <template v-for="g in GROUPS" :key="g.id">
        <section v-if="restOf(g).length" :class="`shoot-rules__group is-${g.level}`">
          <h3>{{ g.label }} {{ restOf(g).length }}장<span :class="`shoot-rules__badge is-${g.level}`">{{ levelLabel(g.level) }}</span></h3>
          <div class="shoot-rules__grid">
            <figure v-for="a in restOf(g)" :key="a.id">
              <RuleIllustration :angle="a.rule" :flip="a.ruleFlip" :plates="PLUS" />
              <figcaption>{{ a.label }}<span v-if="itemLevel(a.id) !== g.level" :class="`shoot-rules__itembadge is-${itemLevel(a.id)}`">{{ levelLabel(itemLevel(a.id)) }}</span></figcaption>
            </figure>
          </div>
        </section>
      </template>
    </div>
    <div class="shoot-rules__cta">
      <button type="button" @click="emit('add')"><Mask :src="rd('camera-outline-24')" />차량 사진 추가</button>
    </div>
  </FocusBox>
</template>
