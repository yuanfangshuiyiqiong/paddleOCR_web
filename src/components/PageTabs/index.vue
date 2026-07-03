<!-- src/components/PageTabs/index.vue -->
<template>
  <div class="page-tabs-container">
    <div class="page-tabs-wrapper">
      <div 
        v-for="(page, index) in pages" 
        :key="page.id"
        class="page-tab"
        :class="{ active: currentPageIndex === index }"
        @click="handlePageSwitch(index)"
      >
        <span 
          class="page-name" 
          @dblclick="startRename(index)"
          :contenteditable="renamingIndex === index"
          @blur="finishRename(index, $event)"
          @keydown.enter="finishRename(index, $event)"
        >
          {{ page.name }}
        </span>
        <el-dropdown v-if="pages.length > 1" trigger="click" @command="handleCommand">
          <span class="page-actions">
            <el-icon><ArrowDown /></el-icon>
          </span>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item :command="{action: 'rename', index}">
                重命名
              </el-dropdown-item>
              <el-dropdown-item :command="{action: 'delete', index}" divided>
                删除
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
      <div class="add-page-btn" @click="addNewPage">
        <el-icon><Plus /></el-icon>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { storeToRefs } from 'pinia'
import { ref, nextTick } from 'vue'
import { usePagesStore } from '@/store/modules/pages'
import useHandleCreate from '@/hooks/useHandleCreate'
import useCanvas from '@/views/Canvas/useCanvas'
import { Plus, ArrowDown } from '@element-plus/icons-vue'
import { useTemplatesStore } from '@/store'

const pagesStore = usePagesStore()
const templatesStore = useTemplatesStore()
const { pages, currentPageIndex, isSwitching } = storeToRefs(pagesStore)
const { createImageElement } = useHandleCreate()
const [canvas] = useCanvas()

const renamingIndex = ref(-1)

const handlePageSwitch = async (index: number) => {
  if (isSwitching.value || currentPageIndex.value === index) return
  await pagesStore.switchPage(index)
}

const addNewPage = async () => {
  // 保存当前页面状态
  await pagesStore.saveCurrentPage()
  
  // 添加新页面（传递空的对象数组以确保页面为空白）
  const newPageName = `页面${pages.value.length + 1}`
  pagesStore.addPage(newPageName, [])
  
  // 清空模板数据
  templatesStore.clearTemplate()
  
  // 参考清空画布的方式清空当前画布，但保留工作区
  const workSpace = canvas.getObjects().find(obj => obj.name === 'workSpace')
  canvas.clear()
  if (workSpace) {
    canvas.add(workSpace)
  }
  canvas.renderAll()
}

const startRename = (index: number) => {
  renamingIndex.value = index
  nextTick(() => {
    const el = document.querySelector(`.page-tab:nth-child(${index + 1}) .page-name`) as HTMLElement
    if (el) {
      el.focus()
      // 选中文本
      const range = document.createRange()
      range.selectNodeContents(el)
      const sel = window.getSelection()
      if (sel) {
        sel.removeAllRanges()
        sel.addRange(range)
      }
    }
  })
}

const finishRename = (index: number, event: FocusEvent | KeyboardEvent) => {
  const target = event.target as HTMLElement
  const newName = target.textContent?.trim() || `页面${index + 1}`
  pagesStore.renamePage(index, newName)
  renamingIndex.value = -1
}

const handleCommand = (command: { action: string; index: number }) => {
  if (command.action === 'rename') {
    startRename(command.index)
  } else if (command.action === 'delete') {
    pagesStore.deletePage(command.index)
  }
}
</script>

<style lang="scss" scoped>
.page-tabs-container {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: #ffffff;
  border-top: 1px solid #e0e0e0;
  z-index: 1000;
  padding: 8px 16px;
  box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.1);
}

.page-tabs-wrapper {
  display: flex;
  align-items: center;
  overflow-x: auto;
  padding-bottom: 4px;
  
  &::-webkit-scrollbar {
    height: 4px;
  }
  
  &::-webkit-scrollbar-thumb {
    background: #c0c0c0;
    border-radius: 2px;
  }
}

.page-tab {
  display: flex;
  align-items: center;
  padding: 6px 12px;
  margin-right: 8px;
  background: #f5f5f5;
  border-radius: 4px;
  cursor: pointer;
  user-select: none;
  min-width: 80px;
  transition: all 0.2s ease;
  
  &:hover {
    background: #e0e0e0;
  }
  
  &.active {
    background: #409eff;
    color: white;
    
    &:hover {
      background: #409eff;
    }
  }
}

.page-name {
  flex: 1;
  outline: none;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  
  &[contenteditable="true"] {
    border: 1px dashed #409eff;
    padding: 2px 4px;
    border-radius: 2px;
    background: white;
    color: #333;
  }
}

.page-actions {
  margin-left: 6px;
  display: flex;
  align-items: center;
  opacity: 0.6;
  
  .page-tab:hover & {
    opacity: 1;
  }
}

.add-page-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f5f5f5;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s ease;
  
  &:hover {
    background: #e0e0e0;
  }
}
</style>