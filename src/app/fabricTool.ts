import { Point, Rect, FabricObject } from 'fabric'
import { watch, computed } from 'vue'
import { storeToRefs } from 'pinia'
import { Disposable } from '@/utils/lifecycle'
import useCanvasSwipe from '@/hooks/useCanvasSwipe'
import { useKeyboardStore } from '@/store'
import { useActiveElement, toValue } from '@vueuse/core'
import { FabricCanvas } from './fabricCanvas'
import { useAnnotationStore } from '@/store/modules/annotation'
import { predictImage } from '@/api/ocr'
import { RightStates } from '@/types/elements'
import { useMainStore } from '@/store'

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
  }

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

  private async captureAndRecognize(left: number, top: number, width: number, height: number) {
    const annotationStore = useAnnotationStore()
    const mainStore = useMainStore()

    annotationStore.setLoading(true)
    mainStore.setRightState(RightStates.ELEMENT_ANNOTATION)

    try {
      // 计算实际像素坐标
      const vpt = this.canvas.viewportTransform || [1, 0, 0, 1, 0, 0]
      const scaleX = vpt[0]
      const scaleY = vpt[3]
      const offsetX = vpt[4]
      const offsetY = vpt[5]

      const actualLeft = Math.max(0, left * scaleX + offsetX)
      const actualTop = Math.max(0, top * scaleY + offsetY)
      const actualWidth = Math.min(this.canvas.width! - actualLeft, width * scaleX)
      const actualHeight = Math.min(this.canvas.height! - actualTop, height * scaleY)

      const dataUrl = this.canvas.toDataURL({
        left: actualLeft,
        top: actualTop,
        width: actualWidth,
        height: actualHeight,
        format: 'png',
        multiplier: 1,
      })

      // 转换为 File 对象
      const blob = await (await fetch(dataUrl)).blob()
      const file = new File([blob], 'capture.png', { type: 'image/png' })

      const res = await predictImage(file)

      const blocks = res.data.blocks ?? []
      const cropDataUrls = await Promise.all(blocks.map((block) => this.cropBlockImage(block, actualLeft, actualTop, actualWidth, actualHeight)))
      annotationStore.addAnnotation(blocks, dataUrl)
      annotationStore.setCropDataUrls(annotationStore.history[0]!.id, cropDataUrls)
    } catch (err) {
      console.error('[Annotation] OCR failed:', err)
    } finally {
      annotationStore.setLoading(false)
    }
  }

  private async cropBlockImage(block: any, baseLeft: number, baseTop: number, baseWidth: number, baseHeight: number): Promise<string> {
    const box = block.box ?? []
    if (!box.length) return ''

    const xs = box.map((p: number[]) => p[0] ?? 0)
    const ys = box.map((p: number[]) => p[1] ?? 0)
    const left = Math.max(0, Math.min(...xs))
    const top = Math.max(0, Math.min(...ys))
    const right = Math.min(baseWidth, Math.max(...xs))
    const bottom = Math.min(baseHeight, Math.max(...ys))

    const width = Math.max(1, right - left)
    const height = Math.max(1, bottom - top)

    return this.canvas.toDataURL({
      left: baseLeft + left,
      top: baseTop + top,
      width,
      height,
      format: 'png',
      multiplier: 1,
    })
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
}
