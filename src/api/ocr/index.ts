import request from '@/utils/request'
import { AxiosPromise } from 'axios'

export interface OCRBlock {
  text: string
  confidence: number
  width: number
  height: number
  box: number[][]
}

export interface OCRResult {
  success: boolean
  filename: string
  total_pages: number
  total_text_blocks: number
  processing_time_ms: number
  device: string
  use_gpu: boolean
  pages: OCRPage[]
}

export interface OCRPage {
  page: number
  img_width: number
  img_height: number
  blocks: OCRBlock[]
}

/** predict 接口的响应结构 */
export interface PredictResponse {
  code?: number
  success?: boolean
  filename?: string
  total_pages?: number
  total_text_blocks?: number
  processing_time_ms?: number
  device?: string
  // 扁平结构：blocks 直接在顶层
  blocks?: OCRBlock[]
  combined_text?: string
  img_width?: number
  img_height?: number
  // 分页结构：pages 包含 blocks
  pages?: OCRPage[]
}

/**
 * 调用 /ocr-api/predict，接收截图图片进行 OCR 识别。
 * 返回扁平化结果：blocks + combined_text。
 */
export function predictImage(
  file: File,
): AxiosPromise<{ data: { blocks: OCRBlock[]; combined_text: string; img_width?: number; img_height?: number } }> {
  const formData = new FormData()
  formData.append('file', file)
  return request({
    url: '/ocr-api/predict',
    method: 'post',
    data: formData,
    headers: {
      'Content-Type': 'multipart/form-data',
    },
    timeout: 60000,
  }).then((res: any) => {
    const raw: PredictResponse = res.data
    // 兼容两种返回结构：1. blocks 在顶层（当前后端） 2. blocks 在 pages[0]（旧后端）
    const blocks: OCRBlock[] = raw.blocks ?? raw.pages?.[0]?.blocks ?? []
    const combined_text = raw.combined_text ?? blocks.map((b: OCRBlock) => b.text).join('')
    const img_width = raw.img_width ?? raw.pages?.[0]?.img_width
    const img_height = raw.img_height ?? raw.pages?.[0]?.img_height
    return {
      ...res,
      data: { blocks, combined_text, img_width, img_height },
    }
  }) as any
}

/**
 * 调用 /ocr-api/ocr（与 predict 相同的后端接口）
 */
export function recognizeImage(file: File): AxiosPromise<OCRResult> {
  const formData = new FormData()
  formData.append('file', file)
  return request({
    url: '/ocr-api/ocr',
    method: 'post',
    data: formData,
    headers: {
      'Content-Type': 'multipart/form-data',
    },
    timeout: 120000,
  })
}

/**
 * 对已有截图旋转指定角度后重新 OCR 识别。
 * @param file 图片文件
 * @param angle 旋转角度 90 | 180 | 270
 */
export function rotateImage(
  file: File,
  angle: 90 | 180 | 270,
): AxiosPromise<{ data: { blocks: OCRBlock[]; combined_text: string } }> {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('angle', String(angle))
  return request({
    url: '/ocr-api/rotate-predict',
    method: 'post',
    data: formData,
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 60000,
  }).then((res: any) => {
    const raw: PredictResponse = res.data
    const blocks: OCRBlock[] = raw.blocks ?? raw.pages?.[0]?.blocks ?? []
    const combined_text = raw.combined_text ?? blocks.map((b: OCRBlock) => b.text).join('')
    return { ...res, data: { blocks, combined_text } }
  }) as any
}
