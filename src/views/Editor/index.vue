<template>
  <el-config-provider :locale="locale.el">
    <Computer v-if="!isMobile()" />
    <Mobile v-else />
  </el-config-provider>

  <div class="editor-container">
    <CanvasHeader />
    <Canvas />
    <CanvasAffix />
    <CanvasICP />
    <PageTabs />
  </div>
</template>

<script lang="ts" setup>

import Computer from '@/views/Editor/computer.vue'
import Mobile from '@/views/Editor/mobile.vue'
import useI18n from '@/hooks/useI18n'
import { useMainStore, useSnapshotStore } from '@/store'
import { storeToRefs } from 'pinia'
import { isMobile } from '@/utils/common'
import { LocalStorageDiscardedKey } from '@/configs/canvas'
import { deleteDiscardedDB } from '@/utils/database'
//页面标签
import PageTabs from '@/components/PageTabs/index.vue'

const { messages } = useI18n()
const { databaseId } = storeToRefs(useMainStore())
const locale = computed(() => messages.value)
if (import.meta.env.MODE === 'production') {
  window.onbeforeunload = () => false
}

const snapshotStore = useSnapshotStore()
// const mainStore = useMainStore()

onMounted(async () => {
  await deleteDiscardedDB()
  // await snapshotStore.initSnapshotDatabase()
  // mainStore.getFonts()
})

// 应用注销时向 localStorage 中记录下本次 indexedDB 的数据库ID，用于之后清除数据库
window.addEventListener('unload', () => {
  const discardedDB = localStorage.getItem(LocalStorageDiscardedKey)
  const discardedDBList: string[] = discardedDB ? JSON.parse(discardedDB) : []
  discardedDBList.push(databaseId.value)
  const newDiscardedDB = JSON.stringify(discardedDBList)
  localStorage.setItem(LocalStorageDiscardedKey, newDiscardedDB)
})
</script>

<style lang="scss" scoped>
.editor-container {
  height: 100vh;
  display: flex;
  flex-direction: column;
  position: relative;
}

// 为画布留出底部空间
:deep(.canvas-container) {
  flex: 1;
  margin-bottom: 50px; // 与页面标签高度一致
}
</style>
