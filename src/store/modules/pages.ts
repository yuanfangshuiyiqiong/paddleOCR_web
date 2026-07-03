// src/store/modules/pages.ts
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import useCanvas from '@/views/Canvas/useCanvas'
import { propertiesToInclude } from '@/configs/canvas'
import { FabricObject, util } from 'fabric'

export interface Page {
  id: string
  name: string
  objects: any[] // 存储页面对象数据
}

export const usePagesStore = defineStore('pages', () => {
  const pages = ref<Page[]>([])
  const currentPageIndex = ref(0)
  const isSwitching = ref(false)

  // 当前页面
  const currentPage = computed(() => {
    return pages.value[currentPageIndex.value] || null
  })

  // 添加页面
  const addPage = (name: string, objects: any[] = []) => {
    const newPage: Page = {
      id: `page_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name,
      objects: [...objects] // 确保创建新的数组引用
    }
    pages.value.push(newPage)
    currentPageIndex.value = pages.value.length - 1
  }

  // 切换页面
  const switchPage = async (index: number) => {
    if (index < 0 || index >= pages.value.length || index === currentPageIndex.value) return
    
    isSwitching.value = true
    
    // 保存当前页面状态
    await saveCurrentPage()
    
    // 切换到目标页面
    currentPageIndex.value = index
    
    // 加载目标页面状态
    await loadCurrentPage()
    
    isSwitching.value = false
  }

  // 保存当前页面状态
  const saveCurrentPage = async (): Promise<void> => {
    const [canvas] = useCanvas()
    if (!canvas || pages.value.length === 0) return
    
    const objects = canvas.getObjects()
      .filter(obj => obj.name !== 'workSpace') // 排除工作区对象
      .map(obj => obj.toObject(propertiesToInclude))
    
    pages.value[currentPageIndex.value].objects = objects
  }

  const restoreObjects = async (objectsData: any[]): Promise<FabricObject[]> => {
    if (!objectsData || objectsData.length === 0) {
      return []
    }
  
    return util.enlivenObjects(objectsData)
  }

  // 加载当前页面状态
  const loadCurrentPage = async (): Promise<void> => {
    const [canvas] = useCanvas()
    if (!canvas || !currentPage.value) return
    
    // 清空画布（保留工作区）
    const workSpace = canvas.getObjects().find(obj => obj.name === 'workSpace')
    canvas.clear()
    if (workSpace) {
      canvas.add(workSpace)
    }
    
    // 加载页面对象
    const objects = currentPage.value.objects
    if (objects && objects.length > 0) {
      try {
        const enlivenedObjects = await restoreObjects(objects)
        enlivenedObjects.forEach(obj => {
          canvas.add(obj)
        })
      } catch (error) {
        console.error('Failed to restore objects:', error)
      }
    }
    
    canvas.renderAll()
  }

  // 重命名页面
  const renamePage = (index: number, newName: string) => {
    if (index >= 0 && index < pages.value.length) {
      pages.value[index].name = newName
    }
  }

  // 删除页面
  const deletePage = async (index: number) => {
    if (pages.value.length <= 1) return // 至少保留一个页面
    
    if (index >= 0 && index < pages.value.length) {
      // 如果删除的是当前页面，先切换到其他页面
      if (index === currentPageIndex.value) {
        const targetIndex = index > 0 ? index - 1 : 1
        await switchPage(targetIndex)
      }
      
      pages.value.splice(index, 1)
      
      // 调整当前页面索引
      if (currentPageIndex.value >= pages.value.length) {
        currentPageIndex.value = pages.value.length - 1
      } else if (currentPageIndex.value > index) {
        currentPageIndex.value--
      }
    }
  }

  // 清空所有页面
  const clearPages = () => {
    pages.value = []
    currentPageIndex.value = 0
  }

  return {
    pages,
    currentPageIndex,
    currentPage,
    isSwitching,
    addPage,
    switchPage,
    saveCurrentPage,
    loadCurrentPage,
    renamePage,
    deletePage,
    clearPages
  }
})