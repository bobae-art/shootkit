<script setup lang="ts">
// 각도별 차 윤곽 선 그림(보배드림이 새로 그린 단순 선 그림)
import type { GuideKind } from "../../lib/items";
defineProps<{ kind: GuideKind }>();
</script>
<template>
  <template v-if="kind === 'side'">
          <path d="M18 128 L18 108 Q20 96 40 92 L92 84 Q118 56 150 52 L214 52 Q240 54 262 80 L292 88 Q304 92 304 106 L304 128 L272 128 A24 24 0 0 0 224 128 L102 128 A24 24 0 0 0 54 128 Z" />
          <path d="M104 86 Q124 62 150 60 L176 60 L176 86 Z M184 60 L212 60 Q234 62 252 86 L184 86 Z" />
          <circle cx="78" cy="128" r="19" />
          <circle cx="248" cy="128" r="19" />
          <path class="is-ground" d="M8 150 L312 150" />
          </template>
  <template v-else-if="kind === 'q34'">
          <path d="M24 136 L24 114 Q26 100 40 96 L84 90 Q108 64 136 58 L224 56 Q254 58 272 82 L294 90 Q304 94 304 108 L304 128 L276 128 A22 23 0 0 0 232 126 L124 132 A22 25 0 0 0 80 134 Z" />
          <path d="M92 90 Q112 68 136 64 L222 62 Q244 64 258 84 Z M176 63 L174 87" />
          <path d="M84 92 L84 126 M30 106 L76 110 L76 117 L32 113 Z M34 122 L78 126" />
          <ellipse cx="102" cy="134" rx="18" ry="21" />
          <ellipse cx="254" cy="128" rx="17" ry="19" />
          <path class="is-ground" d="M8 156 L312 148" />
          </template>
  <template v-else-if="kind === 'front'">
          <path d="M70 132 L70 108 Q72 92 86 88 L104 58 Q110 48 124 48 L196 48 Q210 48 216 58 L234 88 Q248 92 250 108 L250 132 Z" />
          <path d="M108 86 L120 60 L200 60 L212 86 Z" />
          <path d="M80 100 L118 104 L116 112 L82 110 Z M240 100 L202 104 L204 112 L238 110 Z" />
          <rect x="132" y="104" width="56" height="16" rx="4" />
          <rect x="78" y="132" width="24" height="16" rx="4" />
          <rect x="218" y="132" width="24" height="16" rx="4" />
          <path d="M62 88 L78 84 L80 94 M258 88 L242 84 L240 94" />
          <path class="is-ground" d="M40 150 L280 150" />
          </template>
  <template v-else-if="kind === 'rear'">
          <path d="M70 132 L70 104 Q72 90 86 86 L106 58 Q112 48 126 48 L194 48 Q208 48 214 58 L234 86 Q248 90 250 104 L250 132 Z" />
          <path d="M112 84 L124 60 L196 60 L208 84 Z" />
          <path d="M76 96 L122 98 L122 108 L78 106 Z M244 96 L198 98 L198 108 L242 106 Z" />
          <rect x="136" y="110" width="48" height="14" rx="2" />
          <rect x="78" y="132" width="24" height="16" rx="4" />
          <rect x="218" y="132" width="24" height="16" rx="4" />
          <path class="is-ground" d="M40 150 L280 150" />
          </template>
  <template v-else-if="kind === 'dash'">
          <path d="M8 76 Q160 40 312 76 L312 92 Q160 64 8 92 Z" />
          <circle cx="110" cy="120" r="42" />
          <circle cx="110" cy="120" r="11" />
          <path d="M70 116 L99 118 M121 118 L150 116 M110 131 L110 160" />
          <rect x="186" y="78" width="74" height="42" rx="5" />
          <path d="M200 134 L248 134 M196 148 L252 148" />
          </template>
  <template v-else-if="kind === 'cluster'">
          <path d="M52 52 Q160 26 268 52 L276 140 Q160 156 44 140 Z" />
          <circle cx="118" cy="98" r="36" />
          <circle cx="202" cy="98" r="36" />
          <path d="M118 98 L96 78 M202 98 L226 80" />
          <rect x="136" y="122" width="48" height="14" rx="3" />
          </template>
  <template v-else-if="kind === 'engine'">
          <path d="M84 20 L236 20 L268 64 L52 64 Z" />
          <path d="M44 76 L276 76 L264 156 L56 156 Z" />
          <rect x="112" y="92" width="96" height="46" rx="6" />
          <circle cx="80" cy="100" r="12" />
          <rect x="228" y="92" width="28" height="22" rx="3" />
          </template>
  <template v-else-if="kind === 'trunk'">
          <path d="M70 18 L250 18 L262 54 L58 54 Z" />
          <path d="M50 66 L270 66 L256 150 L64 150 Z" />
          <path d="M72 130 L248 130" />
          <path class="is-ground" d="M30 162 L290 162" />
          </template>
  <template v-else>
    <path d="M24 20 L24 44 M24 20 L48 20 M296 20 L296 44 M296 20 L272 20 M24 160 L24 136 M24 160 L48 160 M296 160 L296 136 M296 160 L272 160" />
  </template>
</template>
