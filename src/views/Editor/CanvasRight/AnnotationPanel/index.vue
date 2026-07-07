<template>
  <div class="annotation-panel">
    <!-- Loading state -->
    <div v-if="loading" class="loading-wrap">
      <el-icon class="is-loading" :size="24"><Loading /></el-icon>
      <span class="ml-2">识别中...</span>
    </div>

    <!-- Empty state -->
    <div v-else-if="allTableRows.length === 0" class="empty-wrap">
      <el-icon :size="40"><Picture /></el-icon>
      <p>框选图片区域触发识别</p>
    </div>

    <!-- 卡片列表：每个 OCR 块一张垂直卡片 -->
    <div v-else class="cards-wrap">
      <div
        v-for="row in allTableRows"
        :key="row.index"
        class="field-card"
      >
        <!-- 卡片顶部：序号 + 截图 + 删除 -->
        <div class="card-head">
          <span class="card-index">#{{ row.index }}</span>
          <img
            :src="getCropDataUrl(row)"
            alt="裁剪图"
            class="card-thumb"
          />
          <el-icon class="card-del" @click="deleteRow(row)"><Delete /></el-icon>
        </div>

        <!-- 字段区域：纵向排列 -->
        <div class="card-body">
          <div class="field-item">
            <label class="field-label">子图</label>
            <el-input
              v-model="row.subDrawing"
              size="small"
              placeholder="子图号"
            />
          </div>

          <div class="field-item">
            <label class="field-label">原始值</label>
            <el-input
              v-model="row.originalValue"
              size="small"
              placeholder="原始值"
            />
          </div>

          <div class="field-item">
            <label class="field-label">检具类型</label>
            <el-select
              v-model="row.gageType"
              size="small"
              placeholder="选择检具"
            >
              <el-option
                v-for="g in gageTypes"
                :key="g"
                :label="g"
                :value="g"
              />
            </el-select>
          </div>

          <div class="field-item">
            <label class="field-label">形位公差</label>
            <el-select
              v-model="row.toleranceType"
              size="small"
              placeholder="选择形位公差"
            >
              <el-option
                v-for="t in toleranceTypes"
                :key="t"
                :label="t"
                :value="t"
              />
            </el-select>
          </div>

          <div class="field-item field-item--tolerance">
            <div class="tol-side">
              <label class="field-label">上公差</label>
              <el-input
                v-model="row.upperTolerance"
                size="small"
                placeholder="±"
              />
            </div>
            <div class="tol-side">
              <label class="field-label">下公差</label>
              <el-input
                v-model="row.lowerTolerance"
                size="small"
                placeholder="±"
              />
            </div>
          </div>

          <!-- 旋转按钮组（只显示在该标注的第一行） -->
          <div
            v-if="isFirstRowOfAnnotation(row)"
            class="rotate-bar"
          >
            <el-tooltip content="顺时针旋转90°重识别" placement="top">
              <el-button
                size="small"
                :icon="RefreshRight"
                :loading="rerotatingId === row.annotationId"
                @click="handleRerotate(row.annotationId, getAnnotation(row.annotationId)?.dataUrl ?? '', 90)"
              >90°</el-button>
            </el-tooltip>
            <el-tooltip content="旋转180°重识别" placement="top">
              <el-button
                size="small"
                :icon="RefreshRight"
                :loading="rerotatingId === row.annotationId"
                @click="handleRerotate(row.annotationId, getAnnotation(row.annotationId)?.dataUrl ?? '', 180)"
              >180°</el-button>
            </el-tooltip>
            <el-tooltip content="逆时针旋转90°重识别" placement="top">
              <el-button
                size="small"
                :icon="RefreshLeft"
                :loading="rerotatingId === row.annotationId"
                @click="handleRerotate(row.annotationId, getAnnotation(row.annotationId)?.dataUrl ?? '', 270)"
              >270°</el-button>
            </el-tooltip>
            <el-tooltip content="删除此标注" placement="top">
              <el-icon class="del-anno" @click="removeAnnotation(row.annotationId)"><Delete /></el-icon>
            </el-tooltip>
          </div>
        </div>
      </div>

      <!-- 底部操作栏 -->
      <div class="action-bar">
        <el-button size="small" type="danger" plain @click="clearAll">清空全部</el-button>
        <span class="row-count">共 {{ allTableRows.length }} 条</span>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { ref, computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useAnnotationStore, gageTypes, toleranceTypes, type TableRow } from '@/store/modules/annotation'
import { Loading, Delete, Picture, RefreshRight, RefreshLeft } from '@element-plus/icons-vue'
import { rotateImage } from '@/api/ocr'
import useCanvas from '@/views/Canvas/useCanvas'
import { FabricTool } from '@/app/fabricTool'

const annotationStore = useAnnotationStore()
const { allTableRows, history, loading } = storeToRefs(annotationStore)
const { clearAll, removeRow, removeAnnotation, rerotateAnnotation, setCropDataUrls, recropAnnotation } = annotationStore
const [fabricCanvas] = useCanvas()

/** 获取 FabricTool 实例 */
const getFabricTool = (): FabricTool | undefined => (fabricCanvas as any)?.tool

/** 当前正在重识别的标注 ID */
const rerotatingId = ref<string | null>(null)

/** 根据标注 ID 查找标注对象 */
const getAnnotation = (id: string) =>
  history.value.find((h) => h.id === id)

/** 根据行数据获取对应的裁剪图 URL */
const getCropDataUrl = (row: TableRow) => {
  const item = getAnnotation(row.annotationId)
  if (!item) return ''
  const localIndex = item.tableRows.findIndex((r) => r.index === row.index)
  return item.cropDataUrls[localIndex] || item.dataUrl
}

/** 判断当前行是否是该标注的第一行（用于只渲染一次旋转按钮） */
const isFirstRowOfAnnotation = (row: TableRow) => {
  const item = getAnnotation(row.annotationId)
  return item ? item.tableRows[0]?.index === row.index : false
}

/** 旋转并重识别 */
const handleRerotate = async (
  annotationId: string,
  dataUrl: string,
  angle: 90 | 180 | 270,
) => {
  if (rerotatingId.value) return
  rerotatingId.value = annotationId
  try {
    const blob = await (await fetch(dataUrl)).blob()
    const file = new File([blob], 'capture.png', { type: 'image/png' })
    const res = await rotateImage(file, angle)

    if (!res.data.blocks?.length) {
      console.warn('[Rerotate] 旋转后无识别结果，保留原数据')
      return
    }

    rerotateAnnotation(annotationId, res.data.blocks, dataUrl)
    await recropAnnotation(annotationId)
    getFabricTool()?.redrawAnnotationBubbles(annotationId)
  } catch (err) {
    console.error('[Annotation] Rotate OCR failed:', err)
  } finally {
    rerotatingId.value = null
  }
}

/** 删除单行 */
const deleteRow = (row: TableRow) => {
  const item = getAnnotation(row.annotationId)
  if (!item) return
  if (item.tableRows.length <= 1) {
    removeAnnotation(row.annotationId)
  } else {
    removeRow(row.annotationId, row.index)
  }
}
</script>

<style lang="scss" scoped>
.annotation-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow-y: auto;
}

.loading-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px 0;
  color: #999;
}

.empty-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  color: #bbb;

  p {
    margin-top: 12px;
    font-size: 13px;
  }
}

.cards-wrap {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-bottom: 12px;
}

/* ---------- 每张垂直卡片 ---------- */
.field-card {
  border: 1px solid #e8e8e8;
  border-radius: 8px;
  overflow: hidden;
  background: #fff;
  transition: border-color 0.2s, box-shadow 0.2s;

  &:hover {
    border-color: #409eff;
    box-shadow: 0 2px 10px rgba(64, 158, 255, 0.12);
  }
}

/* ---------- 卡片顶部：序号 + 截图 + 删除 ---------- */
.card-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  background: #fafafa;
  border-bottom: 1px solid #f0f0f0;
}

.card-thumb {
  width: 72px;
  height: 72px;
  object-fit: contain;
  border: 1px solid #eee;
  border-radius: 4px;
  flex-shrink: 0;
  background: #fff;
}

.card-index {
  font-size: 14px;
  font-weight: 700;
  color: #333;
  min-width: 32px;
}

.card-del {
  color: #ccc;
  cursor: pointer;
  font-size: 16px;
  margin-left: auto;

  &:hover {
    color: #f56c6c;
  }
}

/* ---------- 卡片字段区域：纵向排列 ---------- */
.card-body {
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field-item {
  display: flex;
  align-items: center;
  gap: 8px;

  &--tolerance {
    gap: 6px;
  }

  .el-input,
  .el-select {
    flex: 1;
  }
}

.field-label {
  font-size: 11px;
  color: #888;
  width: 54px;
  flex-shrink: 0;
  text-align: right;
}

.tol-side {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 4px;
}

/* ---------- 旋转操作栏 ---------- */
.rotate-bar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding-top: 4px;
  border-top: 1px dashed #eee;
  margin-top: 2px;

  .el-button {
    padding: 0 8px;
    font-size: 11px;
    min-height: 24px;
  }
}

.del-anno {
  color: #ccc;
  cursor: pointer;
  font-size: 15px;
  margin-left: 2px;

  &:hover {
    color: #f56c6c;
  }
}

/* ---------- 底部操作栏 ---------- */
.action-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 0 8px;

  .row-count {
    font-size: 12px;
    color: #999;
  }
}
</style>
