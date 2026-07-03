<template>
  <div style="display: none;">
    <input 
      ref="fileInputRef" 
      type="file" 
      :accept="fileAccept" 
      @change="handleFileSelect" 
      style="display: none;"
    />
  </div>
</template>

<script lang="ts" setup>
import { uploadFile } from '@/api/file'
import { propertiesToInclude, WorkSpaceDrawData } from '@/configs/canvas'
import useCanvasScale from '@/hooks/useCanvasScale'
import useHandleCreate from '@/hooks/useHandleCreate'
import useHandleTemplate from '@/hooks/useHandleTemplate'
import { useTemplatesStore } from '@/store'
import { Template } from "@/types/canvas"
import { getImageDataURL, getImageText } from '@/utils/image'
import useCanvas from '@/views/Canvas/useCanvas'
import { loadSVGFromString } from 'fabric'
import { nanoid } from 'nanoid'
import { ref } from 'vue'
import { storeToRefs } from 'pinia'
import { usePagesStore } from '@/store/modules/pages'

const templatesStore = useTemplatesStore()
const { setCanvasTransform } = useCanvasScale()
const { createImageElement, createVideoElement } = useHandleCreate()
const { addTemplate } = useHandleTemplate()
const fileInputRef = ref<HTMLInputElement | null>(null)
const fileAccept = '.pdf,.psd,.cdr,.ai,.svg,.jpg,.jpeg,.png,.webp,.json,.mp4'
const uploading = ref(false)

// 定义暴露给父组件的方法
const triggerFileSelect = () => {
  if (fileInputRef.value) {
    fileInputRef.value.click()
  }
}

// 暴露方法给父组件
defineExpose({
  triggerFileSelect
})

const generateSVGTemplate = async (dataText: string) => {
  const content = await loadSVGFromString(dataText)
  const options = content.options
  const svgData: any[] = []
  content.objects.slice(0, 1000).forEach(ele => svgData.push((ele as FabricObject).toObject(propertiesToInclude)))
  WorkSpaceDrawData.width = options.width
  WorkSpaceDrawData.height = options.height
  const emptyTemplate: Template = {
    id: nanoid(10),
    version: '6.12',
    zoom: 1,
    width: options.width,
    height: options.height,
    clip: 2,
    objects: [WorkSpaceDrawData, ...svgData],
    workSpace: {
      fillType: 0,
      left: 0,
      top: 0,
      angle: 0,
      scaleX: 1,
      scaleY: 1,
    }
  }
  return emptyTemplate
}

const pagesStore = usePagesStore()

const handleFileSelect = async (event: Event) => {
  const [canvas] = useCanvas()
  const input = event.target as HTMLInputElement
  if (!input.files || input.files.length === 0) {
    return
  }

  const file = input.files[0]
  const filename = file.name
  const fileSuffix = filename.split('.').pop()?.toLowerCase() || ''
  
  if (!fileAccept.split(',').includes(`.${fileSuffix}`)) {
    return
  }

  // 保存当前页面状态
  await pagesStore.saveCurrentPage()

  // 添加新页面
  const newPageName = `页面${pagesStore.pages.length + 1}`
  pagesStore.addPage(newPageName, [])

  // 清空画布，保留工作区
  const workSpace = canvas.getObjects().find(obj => obj.name === 'workSpace')
  canvas.clear()
  if (workSpace) {
    canvas.add(workSpace)
  }

  if (fileSuffix === 'svg') {
    const dataText = await getImageText(file)
    const emptyTemplate = await generateSVGTemplate(dataText)
    await templatesStore.addTemplate(emptyTemplate)
    setCanvasTransform()
    return
  }
  
  if (fileSuffix === 'json') {
    const dataText = await getImageText(file)
    const template = JSON.parse(dataText)
    addTemplate(template)
    return
  }
  
  if (['jpg', 'jpeg', 'png', 'webp'].includes(fileSuffix)) {
    const dataURL = await getImageDataURL(file)
    // 传递额外参数以控制缩放
    const imageId = nanoid();
    createImageElement(dataURL, true)
    setTimeout(() => {
      const [canvas] = useCanvas()
      const imageObjects = canvas.getObjects().filter(obj => obj.type === 'image' && !(obj as any).imageId)
      if (imageObjects.length > 0) {
        imageObjects[0].set('imageId', imageId)
        canvas.requestRenderAll()
      }
    }, 100)

    setCanvasTransform()
    return
  }
  
  if (['mp4'].includes(fileSuffix)) {
    const dataURL = URL.createObjectURL(file)
    createVideoElement(dataURL)
    return
  }
  
  uploading.value = true
  const res = await uploadFile(file, fileSuffix)
  uploading.value = false
  
  if (res && res.data.code === 200) {
    const template = res.data.data
    if (!template) {
      return
    }
    if (['pdf', 'ai'].includes(fileSuffix)) {
      await templatesStore.addTemplate(template)
      setCanvasTransform()
      return
    }
    await templatesStore.addTemplate(template)
    setCanvasTransform()
  }
  
  // 清空input值以便下次选择相同文件也能触发change事件
  input.value = ''
}
</script>

<style lang="scss" scoped></style>