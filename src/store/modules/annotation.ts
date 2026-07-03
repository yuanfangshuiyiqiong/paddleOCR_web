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

export interface AnnotationItem {
  id: string
  /** 当前标注的截图 */
  dataUrl: string
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
     */
    addAnnotation(ocrBlocks: OCRBlock[], dataUrl: string) {
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
      this.history.unshift({ id, dataUrl, ocrBlocks, cropDataUrls: [], tableRows, startIndex, createdAt: Date.now() })
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
      if (idx !== -1) item.tableRows.splice(idx, 1)
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
     * 重新识别指定标注（旋转后 OCR）
     */
    rerotateAnnotation(id: string, blocks: OCRBlock[], dataUrl: string) {
      const item = this.history.find((h) => h.id === id)
      if (!item) return
      item.dataUrl = dataUrl
      item.ocrBlocks = blocks
      item.cropDataUrls = []
      item.tableRows = blocks.map((block, i) => ({
        annotationId: id,
        index: item.startIndex + i,
        subDrawing: '',
        originalValue: block.text,
        gageType: '其他' as GageType,
        toleranceType: '其他' as ToleranceType,
        upperTolerance: '',
        lowerTolerance: '',
      }))
    },
  },
})
