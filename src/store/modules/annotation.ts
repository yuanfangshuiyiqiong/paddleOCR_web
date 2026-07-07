import { defineStore } from 'pinia'
import type { OCRBlock } from '@/api/ocr'

/** 检具类型选项 */
export type GageType = '卡尺' | '千分尺' | '高度尺' | '塞尺' | '螺纹塞规' | '影像仪' | '三坐标' | '其他'

/** 形位公差类型选项 */
export type ToleranceType = '位置度' | '对称度' | '垂直度' | '平行度' | '平面度' | '圆度' | '圆柱度' | '直线度' | '跳动' | '同轴度' | '位置度复合' | '轮廓度' | '其他'

/** 检具类型枚举值列表（用于 el-select） */
export const gageTypes: GageType[] = [
  '卡尺', '千分尺', '高度尺', '塞尺', '螺纹塞规', '影像仪', '三坐标', '其他',
]

/** 形位公差类型枚举值列表（用于 el-select） */
export const toleranceTypes: ToleranceType[] = [
  '位置度', '对称度', '垂直度', '平行度', '平面度', '圆度',
  '圆柱度', '直线度', '跳动', '同轴度', '位置度复合', '轮廓度', '其他',
]

export interface TableRow {
  /** 所属标注 ID */
  annotationId: string
  /** 序号（1-based，全局唯一） */
  index: number
  /** 子图编号 */
  subDrawing: string
  /** 原始测量值 */
  originalValue: string
  /** 检具类型 */
  gageType: GageType
  /** 形位公差类型 */
  toleranceType: ToleranceType
  /** 上公差 */
  upperTolerance: string
  /** 下公差 */
  lowerTolerance: string
}

export interface CropRect {
  left: number
  top: number
  width: number
  height: number
}

export interface AnnotationItem {
  id: string
  /** 当前标注的截图 */
  dataUrl: string
  /** 截图在 canvas 上的像素坐标（用于旋转后重新裁剪子图） */
  cropRect: CropRect
  /** 每行对应原始值的局部裁剪图 */
  cropDataUrls: string[]
  /** 表格数据 */
  tableRows: TableRow[]
  /** OCR 识别出的文字块 */
  ocrBlocks: OCRBlock[]
  /** 该标注第一条行的全局起始序号（用于 rerotate 后保持序号稳定） */
  startIndex: number
  createdAt: number
}

export const useAnnotationStore = defineStore('annotation', {
  state: () => ({
    /** 历史标注列表 */
    history: [] as AnnotationItem[],
    /** 当前是否正在识别 */
    loading: false,
    /** 当前选中的历史记录 ID */
    activeId: null as string | null,
  }),
  getters: {
    activeItem: (state): AnnotationItem | undefined =>
      state.history.find((item) => item.id === state.activeId),
    /** 扁平化的表格行（所有标注的所有行，按全局序号升序排列） */
    allTableRows: (state): TableRow[] =>
      state.history
        .flatMap((item) => item.tableRows)
        .sort((a, b) => a.index - b.index),
    /** 全局序号计数（用于生成新行序号） */
    globalRowCount: (state): number =>
      state.history.reduce((acc, item) => acc + item.tableRows.length, 0),
  },
  actions: {
    /**
     * 添加一条新标注
     * @param ocrBlocks OCR 识别出的文字块
     * @param dataUrl 截图 dataURL
     * @param cropRect 截图在 canvas 上的像素坐标（用于裁剪子图）
     */
    addAnnotation(ocrBlocks: OCRBlock[], dataUrl: string, cropRect: CropRect) {
      const id = `anno-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      const startIndex = this.globalRowCount + 1
      const tableRows: TableRow[] = ocrBlocks.map((block, i) => ({
        annotationId: id,
        index: startIndex + i,
        subDrawing: '',
        originalValue: block.text,
        gageType: '其他' as GageType,
        toleranceType: '其他' as ToleranceType,
        upperTolerance: '',
        lowerTolerance: '',
      }))
      this.history.unshift({ id, dataUrl, cropRect, ocrBlocks, cropDataUrls: [], tableRows, startIndex, createdAt: Date.now() })
      this.activeId = id
    },

    /**
     * 更新指定标注的某一行
     */
    updateRow(annotationId: string, rowIndex: number, updates: Partial<TableRow>) {
      const item = this.history.find((h) => h.id === annotationId)
      if (!item) return
      const row = item.tableRows.find((r) => r.index === rowIndex)
      if (row) Object.assign(row, updates)
    },

    /**
     * 删除一行（从所属标注中移除）
     */
    removeRow(annotationId: string, rowIndex: number) {
      const item = this.history.find((h) => h.id === annotationId)
      if (!item) return
      const idx = item.tableRows.findIndex((r) => r.index === rowIndex)
      if (idx !== -1) {
        item.tableRows.splice(idx, 1)
        item.cropDataUrls.splice(idx, 1)
        item.ocrBlocks.splice(idx, 1)
      }
    },

    /**
     * 删除指定标注
     */
    removeAnnotation(id: string) {
      const idx = this.history.findIndex((item) => item.id === id)
      if (idx !== -1) this.history.splice(idx, 1)
      if (this.activeId === id) {
        this.activeId = this.history.length > 0 ? this.history[0].id : null
      }
    },

    clearAll() {
      this.history = []
      this.activeId = null
    },

    setActiveId(id: string | null) {
      this.activeId = id
    },

    setLoading(loading: boolean) {
      this.loading = loading
    },

    /**
     * 设置某个标注的每行裁剪图
     */
    setCropDataUrls(id: string, cropDataUrls: string[]) {
      const item = this.history.find((h) => h.id === id)
      if (!item) return
      item.cropDataUrls = cropDataUrls
    },

    /**
     * 重新识别指定标注（旋转后 OCR），增量更新：保留原 rows，只更新有新识别结果的行
     */
    rerotateAnnotation(id: string, blocks: OCRBlock[], dataUrl: string) {
      const item = this.history.find((h) => h.id === id)
      if (!item) return
      item.dataUrl = dataUrl
      item.ocrBlocks = blocks
      item.cropDataUrls = []

      const oldRows = item.tableRows
      const newRows: TableRow[] = blocks.map((block, i) => {
        const old = oldRows[i]
        return {
          annotationId: id,
          index: item.startIndex + i,
          subDrawing: old?.subDrawing ?? '',
          originalValue: block.text,
          gageType: old?.gageType ?? '其他',
          toleranceType: old?.toleranceType ?? '其他',
          upperTolerance: old?.upperTolerance ?? '',
          lowerTolerance: old?.lowerTolerance ?? '',
        }
      })

      if (blocks.length < oldRows.length) {
        newRows.push(...oldRows.slice(blocks.length))
      }

      item.tableRows = newRows
    },

    /**
     * 用旋转后的图像重新裁剪指定标注的所有子图
     * 直接基于 item.dataUrl 裁剪，blocks 坐标在旋转后图像空间中，两者一一对应
     */
    async recropAnnotation(id: string): Promise<void> {
      const item = this.history.find((h) => h.id === id)
      if (!item) return

      const cropDataUrls: string[] = []

      for (const block of item.ocrBlocks) {
        const box = block.box ?? []
        if (!box.length) {
          cropDataUrls.push(item.dataUrl)
          continue
        }

        const xs = box.map((p: number[]) => p[0] ?? 0)
        const ys = box.map((p: number[]) => p[1] ?? 0)
        const left = Math.max(0, Math.min(...xs))
        const top = Math.max(0, Math.min(...ys))
        const width = Math.max(1, block.width ?? Math.max(...xs) - left)
        const height = Math.max(1, block.height ?? Math.max(...ys) - top)

        const dataUrl = await this.cropImageByUrl(item.dataUrl, left, top, width, height)
        cropDataUrls.push(dataUrl)
      }

      item.cropDataUrls = cropDataUrls
    },

    /**
     * 根据 imageUrl 裁剪子图并返回 dataURL
     */
    cropImageByUrl(imageUrl: string, left: number, top: number, width: number, height: number): Promise<string> {
      return new Promise((resolve) => {
        const img = new Image()
        img.onload = () => {
          const offscreen = document.createElement('canvas')
          offscreen.width = width
          offscreen.height = height
          const ctx = offscreen.getContext('2d')!
          ctx.drawImage(img, left, top, width, height, 0, 0, width, height)
          resolve(offscreen.toDataURL('image/png'))
        }
        img.onerror = () => resolve(imageUrl)
        img.src = imageUrl
      })
    },
  },
})
