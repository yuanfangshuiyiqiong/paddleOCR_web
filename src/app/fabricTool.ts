import { Point, Rect, FabricObject, Textbox } from 'fabric'
import { watch, computed } from 'vue'
import { storeToRefs } from 'pinia'
import { Disposable } from '@/utils/lifecycle'
import useCanvasSwipe from '@/hooks/useCanvasSwipe'
import { useKeyboardStore, useTemplatesStore } from '@/store'
import { useActiveElement, toValue } from '@vueuse/core'
import { FabricCanvas } from './fabricCanvas'
import { useAnnotationStore } from '@/store/modules/annotation'
import { predictImage } from '@/api/ocr'
import { RightStates } from '@/types/elements'
import { useMainStore } from '@/store'
import { CoordinateTransformer } from './coordinateTransformer'

type ToolOption = {
  defaultCursor: string
  skipTargetFind: boolean
  selection: boolean
}

type ToolType = 'move' | 'handMove' | 'shape' | 'batchAnnotation'

export class FabricTool extends Disposable {

  private options: Record<ToolType, ToolOption> = {
    move: {
      defaultCursor: 'default',
      skipTargetFind: false,
      selection: true,
    },
    handMove: {
      defaultCursor: 'grab',
      skipTargetFind: true,
      selection: false,
    },
    shape: {
      defaultCursor: 'crosshair',
      skipTargetFind: true,
      selection: false,
    },
    batchAnnotation: {
      defaultCursor: 'crosshair',
      skipTargetFind: true,
      selection: false,
    },
  }

  private _handMoveActivate = false
  private toolStop?: () => void
  private currentTool: ToolType = 'move'
  private readonly minRectSize = 0

  private get handMoveActivate() {
    return this._handMoveActivate
  }

  private set handMoveActivate(value) {
    this._handMoveActivate = value
  }

  constructor(private readonly canvas: FabricCanvas) {
    super()
    this.initHandMove()
    this.canvas.tool = this
    // 注入 getBackgroundImage 作为统一取图入口 —— 见本类#getBackgroundImage()
    this.transformer = new CoordinateTransformer(() => this.getBackgroundImage())
  }

  /** 统一的坐标转换入口（所有坐标转换必须走这里） */
  private readonly transformer: CoordinateTransformer

  public applyOption(tool: ToolType) {
    const { defaultCursor, skipTargetFind, selection } = this.options[tool]
    this.canvas.defaultCursor = defaultCursor
    this.canvas.hoverCursor = defaultCursor
    this.canvas.setCursor(defaultCursor)
    this.canvas.skipTargetFind = skipTargetFind
    this.canvas.selection = selection
    this.canvas.upperCanvasEl && (this.canvas.upperCanvasEl.style.cursor = defaultCursor)
  }

  public setTool(tool: ToolType) {
    if (this.currentTool === tool) return
    this.toolStop?.()
    this.toolStop = undefined
    this.currentTool = tool
    this.applyOption(tool)
    if (tool === 'shape' || tool === 'batchAnnotation') {
      this.activateShape()
    }
  }

  public getTool(): ToolType {
    return this.currentTool
  }

  private activateShape() {
    const { canvas } = this
    let coordsStart: Point | undefined
    let tempObject: FabricObject | undefined

    const { stop, isSwiping } = useCanvasSwipe({
      onSwipeStart: (e: any) => {
        if (e.e && 'button' in e.e && e.e.button !== 0) return
        isSwiping.value = true
        const p = canvas.getPointer(e.e)
        coordsStart = new Point(p.x, p.y)
        tempObject = new Rect({
          left: coordsStart.x,
          top: coordsStart.y,
          width: 100,
          height: 100,
          scaleX: 0.01,
          scaleY: 0.01,
          fill: 'transparent',
          stroke: 'pink',
          strokeWidth: 0,
          hideOnLayer: true,
        })
        tempObject.noEventObjectAdded = true
        canvas.add(tempObject)
        tempObject.noEventObjectAdded = false
        canvas.setActiveObject(tempObject)
      },
      onSwipe: (e: any) => {
        if (!tempObject || !coordsStart) return
        const p = canvas.getPointer(e.e)
        const x1 = coordsStart.x
        const y1 = coordsStart.y
        const x2 = p.x
        const y2 = p.y
        const left = Math.min(x1, x2)
        const top = Math.min(y1, y2)
        const width = Math.max(1, Math.abs(x2 - x1))
        const height = Math.max(1, Math.abs(y2 - y1))
        tempObject.set({ left, top, width, height, scaleX: 1, scaleY: 1 })
        tempObject.setCoords()
        canvas.requestRenderAll()
      },
      onSwipeEnd: async (e) => {
        if (!tempObject || !coordsStart) return
        const p = canvas.getPointer(e.e)
        const x1 = coordsStart.x
        const y1 = coordsStart.y
        const x2 = p.x
        const y2 = p.y
        const left = Math.min(x1, x2)
        const top = Math.min(y1, y2)
        const width = Math.max(1, Math.abs(x2 - x1))
        const height = Math.max(1, Math.abs(y2 - y1))

        if (width < this.minRectSize && height < this.minRectSize) {
          canvas.remove(tempObject)
          canvas.discardActiveObject()
          canvas.requestRenderAll()
          tempObject = undefined
          return
        }

        tempObject.set({ left, top, width, height, scaleX: 1, scaleY: 1 })
        tempObject.set({ hideOnLayer: false })
        if (!tempObject.group) {
          canvas._onObjectAdded(tempObject)
        }
        canvas.fire('selection:updated')
        canvas.requestRenderAll()

        // 截取并 OCR 识别
        await this.captureAndRecognize(left, top, width, height)

        tempObject = undefined
      },
    })
    this.toolStop = stop
  }

  private async captureAndRecognize(displayLeft: number, displayTop: number, displayWidth: number, displayHeight: number) {
    const annotationStore = useAnnotationStore()
    const mainStore = useMainStore()

    annotationStore.setLoading(true)
    mainStore.setRightState(RightStates.ELEMENT_ANNOTATION)

    try {
      // ── Step 0: 诊断（仅日志） ──────────────────────────────────────
      console.log('[captureAndRecognize] 画布尺寸:', {
        canvasW: this.canvas.getWidth(),
        canvasH: this.canvas.getHeight(),
        canvasVW: this.canvas.getWidth() / this.canvas.getZoom(),
        canvasVH: this.canvas.getHeight() / this.canvas.getZoom(),
        zoom: this.canvas.getZoom(),
      })

      // ── Step 1: 加载背景图原始图片（HTMLImageElement） ──────────────
      // reloadBgElement 用 imageURL 重新加载，避免 fabric 对象 width/height 为 0 的情况
      const imgElement = await this.reloadBgElement()
      if (!imgElement) {
        console.error('[captureAndRecognize] 无法加载背景图图片')
        return
      }

      // ── Step 2: 显示坐标 → 自然坐标（统一通过 transformer） ────────
      const nat = this.transformer.displayRectToNatural({
        left: displayLeft,
        top: displayTop,
        width: displayWidth,
        height: displayHeight,
      })
      const natLeft = nat.left
      const natTop = nat.top
      const natWidth = nat.width
      const natHeight = nat.height

      // ── 详细诊断日志 ────────────────────────────────────────────────
      console.log('========== 用户框选 ==========')
      console.log({ displayLeft, displayTop, displayWidth, displayHeight })

      console.log('========== 背景图 ==========')
      console.log(this.transformer.getBackgroundInfo())

      console.log('========== Canvas ==========')
      console.log({
        zoom: this.canvas.getZoom(),
        viewport: [...this.canvas.viewportTransform],
      })

      console.log('========== 原图 ==========')
      console.log({
        naturalWidth: imgElement.naturalWidth,
        naturalHeight: imgElement.naturalHeight,
      })

      console.log('========== 自然坐标 ==========')
      console.log({ natLeft, natTop, natWidth, natHeight })

      // ── Step 3: 在原图上裁剪 + 编码成 PNG 发给后端 ──────────────────
      const cropCanvas = document.createElement('canvas')
      cropCanvas.width = Math.max(1, Math.round(natWidth))
      cropCanvas.height = Math.max(1, Math.round(natHeight))
      const ctx = cropCanvas.getContext('2d')!
      ctx.drawImage(
        imgElement,
        natLeft, natTop, natWidth, natHeight,   // 源图裁剪区（自然像素）
        0, 0, natWidth, natHeight                // 目标 canvas（自然像素）
      )

      const blob = await new Promise<Blob>((resolve, reject) =>
        cropCanvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png')
      )
      const file = new File([blob], 'capture.png', { type: 'image/png' })
      console.log('[captureAndRecognize] 发送图片尺寸:', blob.size, 'bytes, natural:', natWidth, 'x', natHeight)

      const res = await predictImage(file)
      console.log('[captureAndRecognize] OCR 完整响应:', JSON.stringify(res.data))

      const blocks = (res.data as any).blocks ?? []
      const startIndex = annotationStore.globalRowCount + 1
      console.log('[captureAndRecognize] 后端返回 blocks 数:', blocks.length, '  startIndex:', startIndex)
      if (blocks.length > 0) {
        console.log('[captureAndRecognize] 第1个 block 原始数据:', JSON.stringify(blocks[0]))
        const previewRect = this.transformer.ocrBoxToDisplayRect(blocks[0], displayLeft, displayTop)
        console.log(`  显示区: left=${previewRect.left.toFixed(2)} top=${previewRect.top.toFixed(2)} w=${previewRect.width.toFixed(2)} h=${previewRect.height.toFixed(2)}`)
      }
      const dataUrl = cropCanvas.toDataURL()

      annotationStore.addAnnotation(blocks, dataUrl, {
        left: displayLeft,
        top: displayTop,
        width: displayWidth,
        height: displayHeight,
      })
      const newId = annotationStore.history[0]!.id
      annotationStore.setCropDataUrls(
        newId,
        await Promise.all(blocks.map((block: any) => this.cropBlockImage(block, displayLeft, displayTop))),
      )

      // ── Step 4: 把 OCR box 还原到画布坐标，画红框 + 序号 ─────────────
      this.drawBubbleAnnotations(blocks, displayLeft, displayTop, startIndex, newId)
    } catch (err) {
      console.error('[Annotation] OCR failed:', err)
    } finally {
      annotationStore.setLoading(false)
    }
  }

  /**
   * 裁剪单个 block 的子图（display 坐标空间）
   * 全部坐标转换走 CoordinateTransformer，本函数不再手算 scale/left/top。
   */
  private cropBlockImage(block: any, cropDisplayLeft: number, cropDisplayTop: number): string {
    const rect = this.transformer.ocrBoxToDisplayRect(block, cropDisplayLeft, cropDisplayTop)
    if (rect.width <= 0 || rect.height <= 0) return ''

    return this.canvas.toDataURL({
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
      format: 'png',
      multiplier: 1,
    })
  }

  /**
   * 绘制泡泡图标注（红框 + 序号）
   * 所有坐标转换统一通过 CoordinateTransformer.ocrBoxToDisplayRect。
   */
  private drawBubbleAnnotations(
    blocks: any[],
    baseDisplayLeft: number,
    baseDisplayTop: number,
    startIndex: number = 1,
    annotationId?: string,
  ) {
    console.log('[drawBubbleAnnotations] baseDispLeft:', baseDisplayLeft, 'baseDispTop:', baseDisplayTop, 'blocks数:', blocks.length)
    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i]
      const r = this.transformer.ocrBoxToDisplayRect(block, baseDisplayLeft, baseDisplayTop)
      if (r.width <= 0 || r.height <= 0) continue
      const dispLeft = r.left
      const dispTop = r.top
      const dispWidth = r.width
      const dispHeight = r.height

      console.log(`[drawBubbleAnnotations] block[${i}] box=${JSON.stringify((block.box ?? [])[0])} → disp left=${dispLeft.toFixed(2)} top=${dispTop.toFixed(2)} w=${dispWidth.toFixed(2)} h=${dispHeight.toFixed(2)}`)
      console.log(`[drawBubbleAnnotations] >>> 即将绘制第 ${i + 1} 个红框 rect`)
      const rect = new Rect({
        left: dispLeft,
        top: dispTop,
        width: dispWidth,
        height: dispHeight,
        fill: 'transparent',
        stroke: '#ff4444',
        strokeWidth: 2,
        selectable: false,
        evented: false,
        name: 'bubble-rect',
      })
      if (annotationId) rect.set('data', { annotationId })

      const indexSize = 20
      const indexLeft = dispLeft + dispWidth
      const indexTop = dispTop - indexSize

      const indexBg = new Rect({
        left: indexLeft,
        top: indexTop,
        width: indexSize,
        height: indexSize,
        fill: '#ff4444',
        rx: 4,
        ry: 4,
        selectable: false,
        evented: false,
        name: 'bubble-index-bg',
      })
      if (annotationId) indexBg.set('data', { annotationId })

      const indexText = new Textbox(String(startIndex + i), {
        left: indexLeft,
        top: indexTop,
        width: indexSize,
        height: indexSize,
        fontSize: 14,
        fill: '#ffffff',
        fontFamily: 'Arial, sans-serif',
        fontWeight: 'bold',
        textAlign: 'center',
        verticalAlign: 'middle',
        selectable: false,
        evented: false,
        name: 'bubble-index-text',
      })
      if (annotationId) indexText.set('data', { annotationId })

      this.canvas.add(rect)
      this.canvas.add(indexBg)
      this.canvas.add(indexText)
    }

    this.canvas.renderAll()
    console.log(`[drawBubbleAnnotations] 全部绘制完成，已调用 renderAll()，当前 canvas 对象数:`, this.canvas.getObjects().length)
  }

  /**
   * 鼠标中键拖动视窗
   */
  private initHandMove() {
    const canvas = this.canvas

    let vpt = canvas.viewportTransform
    const { spaceKeyState } = storeToRefs(useKeyboardStore())
    const { lengthX, lengthY, isSwiping } = useCanvasSwipe({
      onSwipeStart: (e: any) => {
        if (e.e.buttons === 2 || (spaceKeyState.value && e.e.buttons === 1)) {
          isSwiping.value = true
          vpt = canvas.viewportTransform
          this.handMoveActivate = true
          this.applyOption('handMove')
          canvas.setCursor('grab')
        }
      },
      onSwipe: () => {
        if (!this.handMoveActivate) return
        canvas.setCursor('grab')
        requestAnimationFrame(() => {
          const deltaPoint = new Point(lengthX.value, lengthY.value).scalarDivide(canvas.getZoom()).transform(vpt).scalarMultiply(-1)
          canvas.absolutePan(deltaPoint, true)
        })
      },
      onSwipeEnd: () => {
        this.applyOption(spaceKeyState.value ? 'handMove' : this.currentTool)
        if (!this.handMoveActivate) return
        if (!spaceKeyState.value) {
          this.handMoveActivate = false
        }
      },
    })

    const activeElement = useActiveElement()
    const activeElementHasInput = computed(() => activeElement.value?.tagName !== 'INPUT' && activeElement.value?.tagName !== 'TEXTAREA')

    watch(
      computed(() => [spaceKeyState.value, activeElementHasInput.value].every((i) => toValue(i))),
      (space) => {
        this.applyOption(space ? 'handMove' : this.currentTool)
        if (isSwiping.value) return
        this.handMoveActivate = space
      },
    )
  }

  /**
   * 【唯一读取入口】获取画布上的背景图 Fabric Image 对象。
   *
   * 规格约定：背景图在本项目里是作为「普通 Image 对象」add 到画布的，识别规则为
   *   type === 'image' && name === 'image'
   *
   * 业务侧任何需要拿背景图的地方（CoordinateTransformer / reloadBgElement /
   * captureAndRecognize / cropBlockImage / drawBubbleAnnotations ...）
   * 一律走本方法，禁止再访问 canvas.backgroundImage 或 canvas.get('backgroundImage')。
   */
  public getBackgroundImage(): any | null {
    if (!this.canvas || typeof this.canvas.getObjects !== 'function') return null
    const found = this.canvas.getObjects().find(
      (obj: any) => obj?.type === 'image' && obj?.name === 'image',
    )
    return found ?? null
  }

  /**
   * 加载背景图 HTMLImageElement（用于 OCR 截图 / 坐标转换源端）。
   *
   * 加载顺序：
   *   1. 先从「背景图 Fabric 对象」拿 src（dataURL 或 http URL）
   *   2. 拿不到再从 store.workSpace.imageURL 兜底
   *
   * 不涉及坐标转换 —— 坐标转换全部交给 CoordinateTransformer。
   */
  private async reloadBgElement(): Promise<HTMLImageElement | null> {
    const fabricImg = this.getBackgroundImage()
    const src = fabricImg?.getSrc?.() || (fabricImg as any)?.src || ''
    if (src) {
      return new Promise((resolve, reject) => {
        const img = new Image()
        img.crossOrigin = 'anonymous'
        img.onload = () => resolve(img)
        img.onerror = reject
        img.src = src
      })
    }
    // 兜底：从 store workSpace.imageURL 重新加载
    const templatesStore = useTemplatesStore()
    const imageURL = (templatesStore.currentTemplate as any)?.workSpace?.imageURL || ''
    if (!imageURL) {
      console.warn('[reloadBgElement] 无法获取图片 URL')
      return null
    }
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => resolve(img)
      img.onerror = reject
      img.src = imageURL
    })
  }

  public redrawAnnotationBubbles(annotationId: string) {
    const annotationStore = useAnnotationStore()
    const item = annotationStore.history.find((h) => h.id === annotationId)
    if (!item) return

    console.log('[redrawAnnotationBubbles] cropRect:', JSON.stringify(item.cropRect), 'ocrBlocks数:', item.ocrBlocks.length)

    // 清除该标注的旧泡泡图
    const toRemove = this.canvas.getObjects().filter((obj) => (obj as any).data?.annotationId === annotationId)
    toRemove.forEach((obj) => this.canvas.remove(obj))

    // 重新绘制（坐标转换全部由 drawBubbleAnnotations → transformer 完成）
    this.drawBubbleAnnotations(item.ocrBlocks, item.cropRect.left, item.cropRect.top, item.startIndex, annotationId)
  }
}
